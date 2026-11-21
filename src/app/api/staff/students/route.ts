// src/app/api/staff/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { validateStudentRow } from "@/lib/roster/parseAndValidate";
import { logger } from "@/lib/logger";

/**
 * GET /api/staff/students
 * Returns paginated list of students for the school from the session.
 * Query params: classId, status, search, page, pageSize
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    const { role, school_id } = session;
    if (role !== "school_admin" && role !== "platform_admin") {
      throw new AuthError("School administrator privileges required.", 403);
    }
    if (!school_id) {
      throw new AuthError("School context missing.", 400);
    }

    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page")) || 1;
    const pageSize = Number(url.searchParams.get("pageSize")) || 20;
    const skip = (page - 1) * pageSize;
    const class_id = url.searchParams.get("classId") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;

    const where: Record<string, unknown> = { school_id };
    if (class_id) where.class_id = class_id;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { admission_number: { contains: search, mode: "insensitive" } },
        { full_name: { contains: search, mode: "insensitive" } },
      ];
    }

    const [students, total, school] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          admission_number: true,
          full_name: true,
          status: true,
          class_id: true,
          not_in_latest_upload: true,
          updated_at: true,
          class: {
            select: {
              id: true,
              name: true,
            },
          },
          department_id: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.student.count({ where }),
      prisma.school.findUnique({
        where: { id: school_id },
        select: {
          roster_confirmed_at: true,
          roster_confirmed_count: true,
        },
      }),
    ]);

    let changed_since_confirmed = false;
    if (school?.roster_confirmed_at) {
      const currentActiveCount = await prisma.student.count({
        where: { school_id, status: "ACTIVE" },
      });

      if (currentActiveCount !== school.roster_confirmed_count) {
        changed_since_confirmed = true;
      } else {
        const studentModifiedAfter = await prisma.student.findFirst({
          where: {
            school_id,
            OR: [
              { created_at: { gt: school.roster_confirmed_at } },
              { updated_at: { gt: school.roster_confirmed_at } },
            ],
          },
          select: { id: true },
        });
        if (studentModifiedAfter) {
          changed_since_confirmed = true;
        }
      }
    }

    return NextResponse.json({
      students,
      total,
      page,
      pageSize,
      roster_confirmed_at: school?.roster_confirmed_at ?? null,
      roster_confirmed_count: school?.roster_confirmed_count ?? null,
      changed_since_confirmed,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error("[api/staff/students GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/staff/students
 * Adds a new student to the school from the session.
 * Body: { admissionNumber, fullName, classId }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    const { role, school_id } = session;
    if (role !== "school_admin" && role !== "platform_admin") {
      throw new AuthError("School administrator privileges required.", 403);
    }
    if (!school_id) {
      throw new AuthError("School context missing.", 400);
    }

    const body = await request.json();
    const { admissionNumber, fullName, classId } = body;

    const validation = validateStudentRow(
      { admissionNumber, fullName, classId },
      school_id,
    );
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const classRecord = await prisma.class.findUnique({ where: { id: classId } });
    if (!classRecord || classRecord.school_id !== school_id) {
      return NextResponse.json({ error: "Class not found in your school" }, { status: 400 });
    }

    const existing = await prisma.student.findFirst({
      where: { school_id, admission_number: admissionNumber },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "Admission number already exists" }, { status: 409 });
    }

    const student = await prisma.student.create({
      data: {
        admission_number: admissionNumber,
        full_name: fullName,
        class_id: classId,
        school_id,
        status: "ACTIVE",
      },
      select: {
        id: true,
        admission_number: true,
        full_name: true,
        class_id: true,
        status: true,
      },
    });

    return NextResponse.json(student, { status: 201 });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error("[api/staff/students POST]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
