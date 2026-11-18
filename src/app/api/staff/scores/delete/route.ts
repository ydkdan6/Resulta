import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, verifyTeacherAssignment, AuthError } from "@/lib/auth/scope";
import { DeleteScoresSchema } from "@/lib/validation/schemas";
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
    const validation = validateInput(DeleteScoresSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { classId, subjectId, termId, studentIds } = validation.data;

    // 1. Verify Class & Tenant Isolation
    const classObj = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, school_id: true },
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
      select: { id: true, school_id: true },
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

    // 5. Lock Check: A submitted score cannot be deleted
    const submittedCount = await prisma.result.count({
      where: {
        school_id: session.school_id,
        subject_id: subjectId,
        term_id: termId,
        student_id: { in: studentIds },
        status: "SUBMITTED",
      },
    });

    if (submittedCount > 0) {
      return NextResponse.json(
        {
          error: "Scores are locked and cannot be deleted. A school administrator must unlock them first.",
        },
        { status: 403 }
      );
    }

    // 6. Delete draft records from database
    const deleteRes = await prisma.result.deleteMany({
      where: {
        school_id: session.school_id,
        subject_id: subjectId,
        term_id: termId,
        student_id: { in: studentIds },
        status: "DRAFT",
      },
    });

    return NextResponse.json({
      success: true,
      count: deleteRes.count,
      message: `Cleared scores for ${studentIds.length} student(s).`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[api/staff/scores/delete] Error:", error);
    return NextResponse.json({ error: "Failed to delete score records." }, { status: 500 });
  }
}
