import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, verifyTeacherAssignment, verifyTeacherStudentScoreAccess, AuthError } from "@/lib/auth/scope";
import { validateScores, DEFAULT_FALLBACK_SCHEME } from "@/lib/scores/validateScores";
import { SubmitScoresSchema } from "@/lib/validation/schemas";
import { validateInput } from "@/lib/validation/validate";
import { logger } from "@/lib/logger";
import { recordAuditLog } from "@/lib/audit";
import { invalidatePublishedReports } from "@/modules/cache/cacheService";

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
    const zodResult = validateInput(SubmitScoresSchema, rawBody);
    if (!zodResult.success) {
      return zodResult.response;
    }
    const { classId, subjectId, termId, confirmed, scores: rows } = zodResult.data;

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
    let teacherAssignments: { id: string; department_id: string | null }[] = [];
    if (session.role === "teacher") {
      await verifyTeacherAssignment(session.id, session.school_id, classId, subjectId);
      teacherAssignments = await prisma.teacherAssignment.findMany({
        where: {
          school_id: session.school_id,
          teacher_id: session.id,
          class_id: classId,
          subject_id: subjectId,
        },
        select: { id: true, department_id: true },
      });
    } else if (session.role !== "school_admin" && session.role !== "platform_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Lock Check: A submitted score cannot be re-submitted without unlock
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
            "Scores are already submitted and locked. A school administrator must unlock them first.",
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

    // Filter students eligible for this submission (according to departments & assignments)
    const deptSubjects = await prisma.departmentSubject.findMany({
      where: {
        school_id: session.school_id,
        subject_id: subjectId,
      },
      select: { department_id: true },
    });
    const offeringDeptIds = new Set(deptSubjects.map((ds) => ds.department_id));

    const isTeacher = session.role === "teacher";
    const hasAllDepts = !isTeacher || teacherAssignments.some((a) => a.department_id === null);
    const assignedDeptIds = new Set(teacherAssignments.map((a) => a.department_id).filter(Boolean) as string[]);

    const eligibleStudents = classObj.students.filter((student) => {
      if (!student.department_id) return true;
      if (!offeringDeptIds.has(student.department_id)) return false;
      if (isTeacher) {
        if (!hasAllDepts && !assignedDeptIds.has(student.department_id)) {
          return false;
        }
      }
      return true;
    });

    // 7. Strict Submission Validation for eligible students
    const scoreValidation = validateScores({
      rows,
      scheme: gradingScheme,
      students: eligibleStudents,
      isSubmission: true,
    });

    if (!scoreValidation.valid) {
      return NextResponse.json(
        { error: "Submission rejected due to validation errors.", details: scoreValidation.errors },
        { status: 422 }
      );
    }

    // Verify each student write access
    if (session.role === "teacher") {
      for (const row of scoreValidation.validatedRows) {
        await verifyTeacherStudentScoreAccess(
          session.id,
          session.school_id,
          classId,
          subjectId,
          row.student_id
        );
      }
    }

    // 8. Atomic transaction to write SUBMITTED scores
    await prisma.$transaction(
      scoreValidation.validatedRows.map((row: any) =>
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
            status: "SUBMITTED",
          },
          update: {
            ca_score: row.ca_score,
            exam_score: row.exam_score,
            total: row.total,
            grade: row.grade,
            remark: row.remark,
            status: "SUBMITTED",
          },
        })
      )
    );

    // Invalidate caches
    invalidatePublishedReports(session.school_id, termId);

    // 9. Write Immutable Audit Log
    await recordAuditLog({
      schoolId: session.school_id,
      userId: session.id,
      action: "SCORE_SUBMIT",
      entity: "Result",
      entityId: `${classId}:${subjectId}:${termId}`,
      newValues: {
        submitted_by: session.id,
        role: session.role,
        student_count: scoreValidation.validatedRows.length,
        submitted_at: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      count: scoreValidation.validatedRows.length,
      status: "SUBMITTED",
      submittedCount: scoreValidation.validatedRows.length,
      message: `Scores have been submitted and locked successfully (${scoreValidation.validatedRows.length} students).`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[api/staff/scores/submit] Error:", error);
    return NextResponse.json({ error: "Failed to submit scores." }, { status: 500 });
  }
}
