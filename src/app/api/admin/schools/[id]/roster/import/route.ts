// src/app/api/admin/schools/[id]/roster/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
        departments: {
          select: {
            id: true,
            name: true,
            departmentSubjects: {
              include: { subject: { select: { name: true } } },
            },
          },
        },
        students: {
          select: {
            id: true,
            admission_number: true,
            full_name: true,
            class_id: true,
            department_id: true,
            not_in_latest_upload: true,
            class: { select: { name: true } },
            department: { select: { name: true } },
            results: {
              where: { status: "SUBMITTED" },
              select: { subject: { select: { name: true } } },
            },
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
      createMissingDepartments = false,
      confirmDepartmentChanges = false,
      isCompleteList = false,
    } = body as {
      fileName?: string;
      rows: RawRosterRow[];
      skipBadRows?: boolean;
      createMissingClasses?: boolean;
      createMissingDepartments?: boolean;
      confirmDepartmentChanges?: boolean;
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

    // Full server-side re-validation: NEVER trust the browser
    const existingStudents = (school.students || []).map((s) => ({
      admission_number: s.admission_number,
      full_name: s.full_name,
      class_name: s.class?.name || "",
      department_name: s.department?.name || null,
      department_id: s.department_id,
      submittedSubjects: (s.results || []).map((r) => r.subject.name),
    }));
    const existingClassNames = (school.classes || []).map((c) => c.name);
    const existingDepartmentNames = (school.departments || []).map((d) => d.name);

    const departmentSubjectsMap = new Map<string, Set<string>>();
    for (const d of (school.departments || [])) {
      departmentSubjectsMap.set(
        d.name.toLowerCase(),
        new Set((d.departmentSubjects || []).map((ds) => ds.subject.name.toLowerCase()))
      );
    }

    const validation = validateRosterRows(
      rows,
      existingStudents,
      existingClassNames,
      existingDepartmentNames,
      departmentSubjectsMap,
    );

    // If unknown departments exist and createMissingDepartments is false -> return 422
    if (!createMissingDepartments && validation.unknownDepartments.length > 0) {
      return NextResponse.json(
        {
          error: `Unknown department(s) found (${validation.unknownDepartments.join(", ")}). Enable auto-create departments or create them first.`,
          unknownDepartments: validation.unknownDepartments,
        },
        { status: 422 },
      );
    }

    // If department changes exist and confirmDepartmentChanges is not explicitly checked -> return 422
    if (validation.departmentChanges.length > 0 && !confirmDepartmentChanges) {
      return NextResponse.json(
        {
          error: "Explicit confirmation required: One or more students have changes to their assigned department.",
          departmentChanges: validation.departmentChanges,
        },
        { status: 422 },
      );
    }

    if (!skipBadRows && validation.errorCount > 0) {
      // If errors were purely due to unknown departments that can now be auto-created, allow it
      const nonDeptErrors = validation.rows.filter(
        (r) => r.errors.some((e) => !e.includes("Unknown department"))
      );
      if (nonDeptErrors.length > 0 || !createMissingDepartments) {
        return NextResponse.json(
          {
            error: `Import aborted: ${validation.errorCount} row(s) contain errors. You may enable 'skipBadRows' to import valid rows only.`,
            errorCount: validation.errorCount,
          },
          { status: 422 },
        );
      }
    }

    // Filter to rows without unresolvable errors
    const validRows = validation.rows.filter((r) => {
      if (r.errors.length === 0) return true;
      if (createMissingDepartments && r.errors.every((e) => e.includes("Unknown department"))) {
        return true;
      }
      return false;
    });

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

    // Run atomic transaction
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Create missing classes if requested
        const classMap = new Map<string, string>();
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

        // 2. Create missing departments if requested
        const deptMap = new Map<string, string>();
        for (const d of (school.departments || [])) {
          deptMap.set(d.name.trim().toLowerCase(), d.id);
        }

        if (createMissingDepartments && validation.unknownDepartments.length > 0) {
          for (const newDeptName of validation.unknownDepartments) {
            const trimmed = newDeptName.trim();
            const lower = trimmed.toLowerCase();
            if (!deptMap.has(lower)) {
              const created = await tx.department.create({
                data: {
                  school_id: schoolId,
                  name: trimmed,
                },
              });
              deptMap.set(lower, created.id);
            }
          }
        }

        // 3. Upsert student records
        let newImported = 0;
        let updatedImported = 0;
        let unchangedImported = 0;
        const importedAdmissionNumbers = new Set<string>();

        for (const row of validRows) {
          const classId = classMap.get(row.class_name.trim().toLowerCase());
          if (!classId) continue;

          const deptId = row.department_name
            ? deptMap.get(row.department_name.trim().toLowerCase()) ?? null
            : null;

          const admKey = row.admission_number.trim().toLowerCase();
          importedAdmissionNumbers.add(admKey);

          const existing = school.students.find(
            (s) => s.admission_number.trim().toLowerCase() === admKey,
          );

          if (!existing) {
            await tx.student.create({
              data: {
                school_id: schoolId,
                admission_number: row.admission_number.trim(),
                full_name: row.full_name.trim(),
                class_id: classId,
                department_id: deptId,
                status: "ACTIVE",
                not_in_latest_upload: false,
              },
            });
            newImported++;
          } else {
            const needsUpdate =
              existing.full_name !== row.full_name.trim() ||
              existing.class_id !== classId ||
              existing.department_id !== deptId ||
              existing.not_in_latest_upload;

            if (needsUpdate) {
              await tx.student.update({
                where: { id: existing.id },
                data: {
                  full_name: row.full_name.trim(),
                  class_id: classId,
                  department_id: deptId,
                  status: "ACTIVE",
                  not_in_latest_upload: false,
                },
              });
              updatedImported++;
            } else {
              unchangedImported++;
            }
          }
        }

        // 4. Complete list flagging
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

        // 5. Financial snapshots & active counts
        const activeCount =
          typeof (tx as any).student?.count === "function"
            ? await tx.student.count({
                where: { school_id: schoolId, status: "ACTIVE" },
              })
            : ((school.students || []).length || validRows.length);

        const schoolPricing =
          typeof (tx as any).school?.findUnique === "function"
            ? await tx.school.findUnique({
                where: { id: schoolId },
                select: { card_price: true, platform_share: true },
              })
            : null;

        const cardPrice = schoolPricing?.card_price ?? new Prisma.Decimal(2000.0);
        const platformShare = schoolPricing?.platform_share ?? new Prisma.Decimal(1000.0);
        const expectedTotal = cardPrice.mul(activeCount);
        const expectedShare = platformShare.mul(activeCount);
        const schoolShare = expectedTotal.sub(expectedShare);

        // 6. Record Import History
        const importRecord = await tx.studentImport.create({
          data: {
            school_id: schoolId,
            user_id: session.id,
            file_name: fileName,
            new_count: newImported,
            updated_count: updatedImported,
            unchanged_count: unchangedImported,
            error_count: validation.errorCount,
            total_count: validRows.length,
            active_student_count: activeCount,
            expected_total: expectedTotal,
            expected_share: expectedShare,
          },
        });

        // 7. Audit Log with COUNTS ONLY (no student PII)
        await tx.auditLog.create({
          data: {
            school_id: schoolId,
            user_id: session.id,
            action: "ROSTER_IMPORT",
            entity: "Student",
            new_values: {
              fileName,
              newImported,
              updatedImported,
              unchangedImported,
              departmentChangesCount: validation.departmentChanges.length,
              flaggedNotInUploadCount,
              isCompleteList,
              active_student_count: activeCount,
              expected_total: expectedTotal.toNumber(),
              expected_share: expectedShare.toNumber(),
            },
          },
        });

        return {
          success: true,
          newImported,
          updatedImported,
          unchangedImported,
          departmentChangesCount: validation.departmentChanges.length,
          errorCount: validation.errorCount,
          flaggedNotInUploadCount,
          importId: importRecord?.id || null,
          active_student_count: activeCount,
          expected_total: expectedTotal.toNumber(),
          expected_share: expectedShare.toNumber(),
          school_share: schoolShare.toNumber(),
        };
      },
      {
        timeout: 60000,
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
