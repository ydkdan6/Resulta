// src/app/api/staff/students/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { validateStudentRow } from "@/lib/roster/parseAndValidate";
import { logger } from "@/lib/logger";

/**
 * PATCH /api/staff/students/:id
 * Update mutable fields: full_name, class_id, status.
 * admission_number cannot be changed by school_admin.
 * school_id comes only from the session; a student from another school returns 404.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: studentId } = await params;
    const session = await requireAuth(undefined, request);
    const { role, school_id } = session;

    if (role !== "school_admin" && role !== "platform_admin") {
      throw new AuthError("School administrator privileges required.", 403);
    }
    if (!school_id) {
      throw new AuthError("School context missing.", 400);
    }

    const body = await request.json();
    const { admissionNumber, fullName, classId, status } = body;

    // school_admin cannot change admission_number
    if (admissionNumber !== undefined) {
      return NextResponse.json(
        { error: "Admission number cannot be edited" },
        { status: 400 },
      );
    }

    // Load student and enforce school isolation
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student || student.school_id !== school_id) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Validate mutable fields if provided
    if (fullName !== undefined || classId !== undefined) {
      const validation = validateStudentRow(
        {
          admissionNumber: student.admission_number,
          fullName: fullName ?? student.full_name,
          classId: classId ?? student.class_id,
        },
        school_id,
      );
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
    }

    // If class_id is changing, verify it belongs to the same school
    if (classId !== undefined && classId !== student.class_id) {
      const classRec = await prisma.class.findUnique({ where: { id: classId } });
      if (!classRec || classRec.school_id !== school_id) {
        return NextResponse.json(
          { error: "Class not found in your school" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        ...(fullName !== undefined && { full_name: fullName }),
        ...(classId !== undefined && { class_id: classId }),
        ...(status !== undefined && { status }),
      },
      select: {
        id: true,
        admission_number: true,
        full_name: true,
        class_id: true,
        status: true,
      },
    });

    return NextResponse.json(updated);
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error("[api/staff/students/[id] PATCH]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
