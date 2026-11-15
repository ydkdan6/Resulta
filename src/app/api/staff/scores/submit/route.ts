import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, verifyTeacherAssignment, AuthError } from "@/lib/auth/scope";
import { validateScores, DEFAULT_FALLBACK_SCHEME } from "@/lib/scores/validateScores";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);

    if (!session.school_id) {
      return NextResponse.json(
        { error: "User is not associated with any school." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { classId, subjectId, termId, confirmed, scores: rows } = body || {};

    if (!classId || !subjectId || !termId) {
      return NextResponse.json(
        { error: "classId, subjectId, and termId are required." },
        { status: 400 }
      );
    }

    if (!confirmed) {
      return NextResponse.json(
        {
          error:
            "Confirmation required: Please tick the confirmation box certifying that all scores have been verified twice.",
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "Scores list cannot be empty for submission." },
        { status: 400 }
      );
    }

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

    // 5. Lock Check: A submitted score cannot be edited by the teacher
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

    // 7. Strict Submission Validation: missing scores, over-max, duplicates, unknown students
    const validation = validateScores({
      rows,
      scheme: gradingScheme,
      students: classObj.students,
      isSubmission: true,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { error: "Submission rejected due to validation errors.", details: validation.errors },
        { status: 422 }
      );
    }

    // 8. Atomic transaction to write SUBMITTED scores
    await prisma.$transaction(
      validation.validatedRows.map((row) =>
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

    return NextResponse.json({
      success: true,
      count: validation.validatedRows.length,
      status: "SUBMITTED",
      message: "Scores have been submitted and locked successfully.",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[api/staff/scores/submit] Error:", error);
    return NextResponse.json({ error: "Failed to submit scores." }, { status: 500 });
  }
}
