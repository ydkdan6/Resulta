import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/scope";

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);

    // Only school_admin and platform_admin can unlock
    if (session.role === "teacher") {
      return NextResponse.json(
        { error: "Forbidden: Only school administrators can unlock submitted scores." },
        { status: 403 }
      );
    }

    if (session.role !== "school_admin" && session.role !== "platform_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!session.school_id) {
      return NextResponse.json(
        { error: "User is not associated with any school." },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { classId, subjectId, termId, reason } = body || {};

    if (!classId || !subjectId || !termId) {
      return NextResponse.json(
        { error: "classId, subjectId, and termId are required." },
        { status: 400 }
      );
    }

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return NextResponse.json(
        { error: "A valid reason is required to unlock submitted scores." },
        { status: 400 }
      );
    }

    // 1. Verify Class & Tenant Isolation
    const classObj = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: { select: { id: true } },
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
      select: { id: true, school_id: true },
    });

    if (!termObj || termObj.school_id !== session.school_id) {
      return NextResponse.json({ error: "Term not found." }, { status: 404 });
    }

    const studentIds = classObj.students.map((s) => s.id);

    // 4. Atomic transaction: unlock results and create AuditLog entry
    const result = await prisma.$transaction(async (tx) => {
      // Find results to unlock
      const updateRes = await tx.result.updateMany({
        where: {
          school_id: session.school_id!,
          subject_id: subjectId,
          term_id: termId,
          student_id: { in: studentIds },
          status: "SUBMITTED",
        },
        data: {
          status: "DRAFT",
        },
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          school_id: session.school_id,
          user_id: session.id,
          action: "RESULT_UNLOCK",
          entity: "Result",
          entity_id: `${classId}:${subjectId}:${termId}`,
          reason: reason.trim(),
          old_values: { status: "SUBMITTED" },
          new_values: {
            status: "DRAFT",
            class_id: classId,
            subject_id: subjectId,
            term_id: termId,
            unlocked_count: updateRes.count,
          },
        },
      });

      return updateRes.count;
    });

    return NextResponse.json({
      success: true,
      unlocked_count: result,
      message: `Scores unlocked successfully (${result} student records reset to draft).`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[api/staff/scores/unlock] Error:", error);
    return NextResponse.json({ error: "Failed to unlock scores." }, { status: 500 });
  }
}
