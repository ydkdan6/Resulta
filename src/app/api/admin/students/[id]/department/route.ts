import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, AuthError } from "@/lib/auth/scope";
import { AssignStudentDepartmentSchema } from "@/lib/validation/departmentSchemas";
import { validateInput } from "@/lib/validation/validate";
import { logger } from "@/lib/logger";

/**
 * PATCH /api/admin/students/[id]/department
 * Assign or update a student's department.
 * Only platform_admin can change student department (403 for others).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin(undefined, request);
    const { id: studentId } = await context.params;

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(AssignStudentDepartmentSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }

    const { department_id } = validation.data;

    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { school: { select: { id: true } } },
    });

    if (!student) {
      return NextResponse.json({ error: "Student not found." }, { status: 404 });
    }

    if (department_id) {
      const dept = await prisma.department.findUnique({
        where: { id: department_id },
      });
      if (!dept || dept.school_id !== student.school_id) {
        return NextResponse.json(
          { error: "Department not found in this school." },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: {
        department_id: department_id ?? null,
      },
      select: {
        id: true,
        admission_number: true,
        full_name: true,
        class_id: true,
        department_id: true,
        status: true,
      },
    });

    return NextResponse.json({ student: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[PATCH /api/admin/students/[id]/department] Error:", error);
    return NextResponse.json({ error: "Failed to update student department." }, { status: 500 });
  }
}
