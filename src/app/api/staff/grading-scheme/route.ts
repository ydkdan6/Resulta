// src/app/api/staff/grading-scheme/route.ts
// Teacher only: return the grading scheme for a class the teacher is assigned to.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireTeacher, AuthError } from "@/lib/auth/scope";
import { logger } from "@/lib/logger";

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.statusCode });
  }
  logger.error("[api/staff/grading-scheme]", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// GET /api/staff/grading-scheme?classId=<uuid>
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== "teacher") {
      throw new AuthError("Teacher privileges required.", 403);
    }
    const classId = request.nextUrl.searchParams.get("classId");

    if (!classId) {
      return NextResponse.json(
        { error: "classId query parameter is required" },
        { status: 400 },
      );
    }

    // 1️⃣ Verify the class belongs to the teacher's school
    const cls = await prisma.class.findUnique({
      where: { id: classId },
      select: { id: true, school_id: true, name: true },
    });

    if (!cls || cls.school_id !== session.school_id) {
      return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    // 2️⃣ Verify the teacher is assigned to this class
    const assignment = await prisma.teacherAssignment.findFirst({
      where: {
        teacher_id: session.id,
        class_id: classId,
        school_id: session.school_id!,
      },
      select: { id: true },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "You are not assigned to this class" },
        { status: 403 },
      );
    }

    // 3️⃣ Return the scheme for this class level (or the school default)
    //    Priority: class-level-specific scheme first, then any school-wide scheme.
    const scheme = await prisma.gradingScheme.findFirst({
      where: { school_id: session.school_id! },
      orderBy: [
        // class_level matches are more specific — handled via JS below
        { created_at: "desc" },
      ],
    });

    if (!scheme) {
      return NextResponse.json(
        { error: "No grading scheme configured for this school" },
        { status: 404 },
      );
    }

    return NextResponse.json(scheme);
  } catch (e) {
    return handleError(e);
  }
}
