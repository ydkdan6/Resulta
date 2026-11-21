import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, AuthError } from "@/lib/auth/scope";
import { CreateDepartmentSchema } from "@/lib/validation/departmentSchemas";
import { validateInput } from "@/lib/validation/validate";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/departments?schoolId=...
 * Only platform_admin can access.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(undefined, request);

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId");

    if (!schoolId) {
      return NextResponse.json({ error: "schoolId parameter is required." }, { status: 400 });
    }

    const departments = await prisma.department.findMany({
      where: { school_id: schoolId },
      include: {
        departmentSubjects: {
          include: {
            subject: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        _count: {
          select: { students: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ departments });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[GET /api/admin/departments] Error:", error);
    return NextResponse.json({ error: "Failed to fetch departments." }, { status: 500 });
  }
}

/**
 * POST /api/admin/departments
 * Creates a department for a school and connects offered subjects.
 * Only platform_admin can create departments (403 for others).
 */
export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdmin(undefined, request);

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(CreateDepartmentSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }

    const { school_id, name, subject_ids } = validation.data;

    // Check school existence
    const school = await prisma.school.findUnique({
      where: { id: school_id },
      select: { id: true },
    });

    if (!school) {
      return NextResponse.json({ error: "School not found." }, { status: 404 });
    }

    // Check duplicate department name in school
    const existing = await prisma.department.findUnique({
      where: {
        school_id_name: {
          school_id,
          name,
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: `Department "${name}" already exists in this school.` },
        { status: 409 }
      );
    }

    // Verify all subject_ids belong to this school
    if (subject_ids && subject_ids.length > 0) {
      const subjects = await prisma.subject.findMany({
        where: {
          id: { in: subject_ids },
          school_id,
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

    // Create department and subjects inside transaction
    const department = await prisma.$transaction(async (tx) => {
      const dept = await tx.department.create({
        data: {
          school_id,
          name,
        },
      });

      if (subject_ids && subject_ids.length > 0) {
        await tx.departmentSubject.createMany({
          data: subject_ids.map((subject_id) => ({
            department_id: dept.id,
            subject_id,
            school_id,
          })),
        });
      }

      return tx.department.findUnique({
        where: { id: dept.id },
        include: {
          departmentSubjects: {
            include: {
              subject: { select: { id: true, name: true, code: true } },
            },
          },
        },
      });
    });

    return NextResponse.json({ department }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[POST /api/admin/departments] Error:", error);
    return NextResponse.json({ error: "Failed to create department." }, { status: 500 });
  }
}
