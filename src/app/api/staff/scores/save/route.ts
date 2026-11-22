import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, verifyTeacherAssignment, verifyTeacherStudentScoreAccess, AuthError } from "@/lib/auth/scope";
import { validateScores, DEFAULT_FALLBACK_SCHEME } from "@/lib/scores/validateScores";
import { SaveScoresSchema } from "@/lib/validation/schemas";
import { validateInput } from "@/lib/validation/validate";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);

    if (!session.school_id) {
      return NextResponse.json(
        { error: "User is not associated with any school." },
        { status: 400 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const zodResult = validateInput(SaveScoresSchema, rawBody);
    if (!zodResult.success) {
      return zodResult.response;
    }
    const { classId, subjectId, termId, scores: rows } = zodResult.data;

    // 1. Verify Class & Tenant Isolation
    const classObj = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            admission_number: true,
            full_name: true,
            department_id: true,
            status: true,
          },
        },
      },
    });

    if (!classObj || classObj.school_id !== session.school_id) {
      return NextResponse.json({ error: "Class not found." }, { status: 404 });
    }

    // 2. Verify Subject
    const subjectObj = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, school_id: true },
    });

    if (!subjectObj || subjectObj.school_id !== session.school_id) {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }

    // 3. Verify Term
    const termObj = await prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, school_id: true, status: true },
    });

    if (!termObj || termObj.school_id !== session.school_id) {
      return NextResponse.json({ error: "Term not found." }, { status: 404 });
    }

    // 4. Role Authorization: Teacher assignment check
    if (session.role === "teacher") {
      await verifyTeacherAssignment(session.id, session.school_id, classId, subjectId);
    } else if (session.role !== "school_admin" && session.role !== "platform_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Lock Check: A submitted score cannot be edited
    const studentIds = classObj.students.map((s) => s.id);
    const existingSubmitted = await prisma.result.findFirst({
      where: {
        school_id: session.school_id,
        subject_id: subjectId,
        term_id: termId,
        student_id: { in: studentIds },
        status: "SUBMITTED",
      },
      select: { id: true },
    });

    if (existingSubmitted) {
      return NextResponse.json(
        {
          error:
            "Scores are locked and cannot be edited. A school administrator must unlock them first.",
        },
        { status: 403 }
      );
    }

    // 6. Grading Scheme Resolution
    const schemes = await prisma.gradingScheme.findMany({
      where: { school_id: session.school_id },
      orderBy: { created_at: "desc" },
    });

    const matchedScheme =
      schemes.find((s) => s.class_level && classObj.name.includes(s.class_level)) ||
      schemes.find((s) => !s.class_level) ||
      schemes[0];

    const gradingScheme = matchedScheme
      ? {
          parts: matchedScheme.parts as any,
          boundaries: matchedScheme.boundaries as any,
        }
      : DEFAULT_FALLBACK_SCHEME;

    // 7. Validate Scores (Draft mode)
    const scoreValidation = validateScores({
      rows,
      scheme: gradingScheme,
      students: classObj.students,
      isSubmission: false,
    });

    if (!scoreValidation.valid) {
      return NextResponse.json(
        { error: "Validation failed.", details: scoreValidation.errors },
        { status: 422 }
      );
    }

    // 8. Teacher student score write checks (enforce department offering & teacher scope)
    const rowsToSave = scoreValidation.validatedRows.filter((r: any) => r.hasAnyScore);

    if (session.role === "teacher") {
      for (const row of rowsToSave) {
        await verifyTeacherStudentScoreAccess(
          session.id,
          session.school_id,
          classId,
          subjectId,
          row.student_id
        );
      }
    }

    // 8b. Fetch existing results before saving to support audit logging if edits are made after unlock
    const existingResultsForAudit = await prisma.result.findMany({
      where: {
        school_id: session.school_id,
        subject_id: subjectId,
        term_id: termId,
        student_id: { in: rowsToSave.map((r: any) => r.student_id) },
      },
      select: {
        id: true,
        student_id: true,
        ca_score: true,
        exam_score: true,
        total: true,
        status: true,
      },
    });

    const existingResultsMap = new Map<string, (typeof existingResultsForAudit)[0]>();
    for (const er of existingResultsForAudit) {
      existingResultsMap.set(er.student_id, er);
    }

    const auditChanges: { student_id: string; old_total: number | null; new_total: number | null }[] = [];
    for (const r of rowsToSave) {
      const prev = existingResultsMap.get(r.student_id);
      if (prev && (Number(prev.ca_score) !== Number(r.ca_score) || Number(prev.exam_score) !== Number(r.exam_score))) {
        auditChanges.push({
          student_id: r.student_id,
          old_total: prev.total !== null ? Number(prev.total) : null,
          new_total: r.total,
        });
      }
    }

    // 9. Atomic database transaction to save draft results
    if (rowsToSave.length > 0) {
      await prisma.$transaction(
        rowsToSave.map((row: any) =>
          prisma.result.upsert({
            where: {
              student_id_term_id_subject_id: {
                student_id: row.student_id,
                term_id: termId,
                subject_id: subjectId,
              },
            },
            create: {
              school_id: session.school_id!,
              student_id: row.student_id,
              term_id: termId,
              subject_id: subjectId,
              ca_score: row.ca_score,
              exam_score: row.exam_score,
              total: row.total,
              grade: row.grade,
              remark: row.remark,
              status: "DRAFT",
            },
            update: {
              ca_score: row.ca_score,
              exam_score: row.exam_score,
              total: row.total,
              grade: row.grade,
              remark: row.remark,
              status: "DRAFT",
            },
          })
        )
      );

      // If changes occurred to previously existing records (such as after unlock), record audit log
      if (auditChanges.length > 0) {
        const { recordAuditLog } = await import("@/lib/audit");
        await recordAuditLog({
          schoolId: session.school_id,
          userId: session.id,
          action: "SCORE_EDIT_AFTER_UNLOCK",
          entity: "Result",
          entityId: `${classId}:${subjectId}:${termId}`,
          reason: "Score edited and updated",
          oldValues: { modified_count: auditChanges.length, sample: auditChanges.slice(0, 5) },
          newValues: { updated_by: session.id, role: session.role },
        });
      }
    }

    return NextResponse.json({
      success: true,
      savedCount: rowsToSave.length,
      message: "Scores saved as draft.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[api/staff/scores/save] Error:", error);
    return NextResponse.json({ error: "Failed to save scores." }, { status: 500 });
  }
}
