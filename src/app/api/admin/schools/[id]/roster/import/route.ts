// src/app/api/admin/schools/[id]/roster/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/scope";
import {
  validateRosterRows,
  RawRosterRow,
  MAX_ROWS_LIMIT,
} from "@/lib/roster/parseAndValidate";
import { logger } from "@/lib/logger";
import {
  checkUploadRateLimit,
  recordUpload,
} from "@/modules/security/rateLimiter";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const session = await requireAuth(undefined, request);
    if (session.role !== "platform_admin") {
      throw new AuthError("Platform administrator privileges required.", 403);
    }

    const { id: schoolId } = await context.params;

    const rateKey = `${ip}:${session.id}`;
    const rateCheck = checkUploadRateLimit(rateKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.message || 'Upload limit reached. Please wait before uploading another file.' },
        { status: 429 }
      );
    }
    recordUpload(rateKey);

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        classes: { select: { id: true, name: true } },
        students: {
          select: {
            id: true,
            admission_number: true,
            full_name: true,
            class_id: true,
            class: { select: { name: true } },
          },
        },
      },
    });

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    const body = await request.json();
    const {
      fileName = "roster-upload",
      rows,
      skipBadRows = false,
      createMissingClasses = false,
      isCompleteList = false,
    } = body as {
      fileName?: string;
      rows: RawRosterRow[];
      skipBadRows?: boolean;
      createMissingClasses?: boolean;
      isCompleteList?: boolean;
    };

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No rows provided for import" }, { status: 400 });
    }

    if (rows.length > MAX_ROWS_LIMIT) {
      return NextResponse.json(
        { error: `Row count exceeds maximum limit of ${MAX_ROWS_LIMIT}` },
        { status: 400 },
      );
    }

    // Full server-side re-validation
    const existingStudents = school.students.map((s) => ({
      admission_number: s.admission_number,
      full_name: s.full_name,
      class_name: s.class?.name || "",
    }));
    const existingClassNames = school.classes.map((c) => c.name);

    const validation = validateRosterRows(
      rows,
      existingStudents,
      existingClassNames,
    );

    if (!skipBadRows && validation.errorCount > 0) {
      return NextResponse.json(
        {
          error: `Import aborted: ${validation.errorCount} row(s) contain errors. You may enable 'skipBadRows' to import valid rows only.`,
          errorCount: validation.errorCount,
        },
        { status: 422 },
      );
    }

    // Filter to rows without errors
    const validRows = validation.rows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      return NextResponse.json(
        { error: "No valid rows remaining to import" },
        { status: 400 },
      );
    }

    // Check unknown classes if createMissingClasses is false
    if (!createMissingClasses && validation.unknownClasses.length > 0) {
      return NextResponse.json(
        {
          error: `Unknown class names found (${validation.unknownClasses.join(", ")}). Enable auto-create classes or add them first.`,
          unknownClasses: validation.unknownClasses,
        },
        { status: 422 },
      );
    }

    // Run atomic transaction with timeout
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Create missing classes if requested
        const classMap = new Map<string, string>(); // class name (lower) -> class id
        for (const c of school.classes) {
          classMap.set(c.name.trim().toLowerCase(), c.id);
        }

        if (createMissingClasses && validation.unknownClasses.length > 0) {
          for (const newClsName of validation.unknownClasses) {
            const trimmed = newClsName.trim();
            const lower = trimmed.toLowerCase();
            if (!classMap.has(lower)) {
              const created = await tx.class.create({
                data: {
                  school_id: schoolId,
                  name: trimmed,
                },
              });
              classMap.set(lower, created.id);
            }
          }
        }

        // 2. Map existing students by admission number
        const existingStudentMap = new Map<string, { id: string }>();
        for (const s of school.students) {
          existingStudentMap.set(s.admission_number.trim().toLowerCase(), { id: s.id });
        }

        let newImported = 0;
        let updatedImported = 0;
        let unchangedImported = 0;

        const importedAdmissionNumbers = new Set<string>();

        // Process in batches
        const BATCH_SIZE = 150;
        for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
          const chunk = validRows.slice(i, i + BATCH_SIZE);

          for (const row of chunk) {
            const admKey = row.admission_number.trim().toLowerCase();
            importedAdmissionNumbers.add(admKey);
            const classId = classMap.get(row.class_name.trim().toLowerCase());

            if (!classId) {
              throw new Error(`Class ${row.class_name} could not be resolved.`);
            }

            const existing = existingStudentMap.get(admKey);
            if (!existing) {
              await tx.student.create({
                data: {
                  school_id: schoolId,
                  admission_number: row.admission_number.trim(),
                  full_name: row.full_name,
                  class_id: classId,
                  status: "ACTIVE",
                  not_in_latest_upload: false,
                },
              });
              newImported++;
            } else {
              if (row.action === "UPDATE") {
                await tx.student.update({
                  where: { id: existing.id },
                  data: {
                    full_name: row.full_name,
                    class_id: classId,
                    not_in_latest_upload: false,
                  },
                });
                updatedImported++;
              } else {
                // UNCHANGED - clear not_in_latest_upload if it was previously flagged
                await tx.student.update({
                  where: { id: existing.id },
                  data: {
                    not_in_latest_upload: false,
                  },
                });
                unchangedImported++;
              }
            }
          }
        }

        // 3. Complete list flagging
        let flaggedNotInUploadCount = 0;
        if (isCompleteList) {
          const studentsToFlag = school.students.filter(
            (s) => !importedAdmissionNumbers.has(s.admission_number.trim().toLowerCase()),
          );
          if (studentsToFlag.length > 0) {
            await tx.student.updateMany({
              where: {
                id: { in: studentsToFlag.map((s) => s.id) },
              },
              data: {
                not_in_latest_upload: true,
              },
            });
            flaggedNotInUploadCount = studentsToFlag.length;
          }
        }

        // 4. Resolve user_id safely (prevent FK failure if session ID is stale after DB re-seed)
        let resolvedUserId: string | null = null;
        if (session.id) {
          const userRec = await (tx as any).user?.findUnique?.({
            where: { id: session.id },
            select: { id: true },
          });
          if (userRec) {
            resolvedUserId = userRec.id;
          } else if (session.email) {
            const userByEmail = await (tx as any).user?.findUnique?.({
              where: { email: session.email.toLowerCase().trim() },
              select: { id: true },
            });
            if (userByEmail) {
              resolvedUserId = userByEmail.id;
            }
          }
        }

        // 5. Record Import History (no student names logged)
        const importRecord = await (tx as any).studentImport?.create?.({
          data: {
            school_id: schoolId,
            user_id: resolvedUserId,
            file_name: fileName,
            new_count: newImported,
            updated_count: updatedImported,
            unchanged_count: unchangedImported,
            error_count: validation.errorCount,
            total_count: validRows.length,
          },
        });

        // 6. Audit Log (no student names logged)
        await tx.auditLog.create({
          data: {
            school_id: schoolId,
            user_id: resolvedUserId,
            action: "ROSTER_IMPORT",
            entity: "Student",
            new_values: {
              fileName,
              newImported,
              updatedImported,
              unchangedImported,
              flaggedNotInUploadCount,
              isCompleteList,
            },
          },
        });

        return {
          success: true,
          newImported,
          updatedImported,
          unchangedImported,
          errorCount: validation.errorCount,
          flaggedNotInUploadCount,
          importId: importRecord?.id || null,
        };
      },
      {
        timeout: 60000, // 60s timeout for up to 3000 rows
      },
    );

    return NextResponse.json(result);
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const message = e instanceof Error ? e.message : "Internal server error";
    console.error("[api/admin/roster/import]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
