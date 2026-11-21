import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, AuthError } from "@/lib/auth/scope";
import { UpdateDepartmentSchema } from "@/lib/validation/departmentSchemas";
import { validateInput } from "@/lib/validation/validate";
import { logger } from "@/lib/logger";

/**
 * PATCH /api/admin/departments/[id]
 * Update department name, is_archived, or offered subjects.
 * Only platform_admin can modify departments (403 for others).
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin(undefined, request);
    const { id } = await context.params;

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(UpdateDepartmentSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }

    const { name, subject_ids, is_archived } = validation.data;

    const existing = await prisma.department.findUnique({
      where: { id },
      include: { school: { select: { id: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: "Department not found." }, { status: 404 });
    }

    if (name && name !== existing.name) {
      const duplicate = await prisma.department.findUnique({
        where: {
          school_id_name: {
            school_id: existing.school_id,
            name,
          },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `Department "${name}" already exists in this school.` },
          { status: 409 }
        );
      }
    }

    if (subject_ids) {
      const subjects = await prisma.subject.findMany({
        where: {
          id: { in: subject_ids },
          school_id: existing.school_id,
        },
        select: { id: true },
      });
      if (subjects.length !== subject_ids.length) {
        return NextResponse.json(
          { error: "One or more subjects do not belong to this school." },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const dept = await tx.department.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(is_archived !== undefined && { is_archived }),
        },
      });

      if (subject_ids !== undefined) {
        // Replace subjects
        await tx.departmentSubject.deleteMany({
          where: { department_id: id },
        });

        if (subject_ids.length > 0) {
          await tx.departmentSubject.createMany({
            data: subject_ids.map((subject_id) => ({
              department_id: id,
              subject_id,
              school_id: existing.school_id,
            })),
          });
        }
      }

      return tx.department.findUnique({
        where: { id },
        include: {
          departmentSubjects: {
            include: {
              subject: { select: { id: true, name: true, code: true } },
            },
          },
        },
      });
    });

    return NextResponse.json({ department: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[PATCH /api/admin/departments/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to update department." }, { status: 500 });
  }
}
