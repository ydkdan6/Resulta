import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin, AuthError } from '@/lib/auth/scope';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AdminAssignTeacherSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';

export async function POST(request: NextRequest) {
  try {
    // Explicit rule: school_admin and teacher CANNOT create assignments. Only platform_admin can.
    await requirePlatformAdmin(undefined, request);

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(AdminAssignTeacherSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { school_id, teacher_id, class_id, subject_id, department_ids, all_departments } = validation.data;

    // Verify all entities belong to the same school
    const [teacher, classObj, subject] = await Promise.all([
      prisma.user.findFirst({
        where: { id: teacher_id, school_id, role: 'teacher' },
      }),
      prisma.class.findFirst({
        where: { id: class_id, school_id },
      }),
      prisma.subject.findFirst({
        where: { id: subject_id, school_id },
      }),
    ]);

    if (!teacher) {
      return NextResponse.json({ error: 'Teacher not found in this school.' }, { status: 404 });
    }
    if (!classObj) {
      return NextResponse.json({ error: 'Class not found in this school.' }, { status: 404 });
    }
    if (!subject) {
      return NextResponse.json({ error: 'Subject not found in this school.' }, { status: 404 });
    }

    // Determine target departments:
    // If all_departments is true OR department_ids is empty / not supplied: one assignment with department_id = null
    const isAllDepartments = all_departments || !department_ids || department_ids.length === 0;

    // Enforce server-side rule: Reject a subject that the chosen department does not offer!
    if (!isAllDepartments && department_ids && department_ids.length > 0) {
      const depts = await prisma.department.findMany({
        where: { id: { in: department_ids }, school_id },
        include: {
          departmentSubjects: {
            where: { subject_id },
          },
        },
      });

      if (depts.length !== department_ids.length) {
        return NextResponse.json({ error: 'One or more departments not found in this school.' }, { status: 404 });
      }

      for (const dept of depts) {
        if (dept.departmentSubjects.length === 0) {
          return NextResponse.json(
            { error: `Department "${dept.name}" does not offer subject "${subject.name}".` },
            { status: 400 }
          );
        }
      }
    }

    // Transaction to safely handle creation and duplicate prevention
    const createdAssignments = await prisma.$transaction(async (tx) => {
      // Check existing assignments for this teacher, class, and subject
      const existing = await tx.teacherAssignment.findMany({
        where: {
          school_id,
          teacher_id,
          class_id,
          subject_id,
        },
      });

      const existingDeptIds = new Set(existing.map((e) => e.department_id));
      const hasExistingAll = existingDeptIds.has(null);

      if (isAllDepartments) {
        // Enforce: one all-departments assignment per teacher, class and subject
        if (hasExistingAll) {
          return existing.filter((e) => e.department_id === null);
        }
        // If an all-departments assignment is created, also verify if any department lines exist or if allowed.
        // User rule: add tests for duplicate all-department assignments and for an all-departments line plus a department line.
        // If duplicate all-departments is requested, return existing or reject if needed.
        const created = await tx.teacherAssignment.create({
          data: {
            school_id,
            teacher_id,
            class_id,
            subject_id,
            department_id: null,
          },
          include: {
            class: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true, code: true } },
            department: { select: { id: true, name: true } },
          },
        });
        return [created];
      } else {
        // Creating per department
        const toCreateDeptIds = (department_ids || []).filter((deptId) => !existingDeptIds.has(deptId));
        const results = existing.filter((e) => e.department_id && department_ids?.includes(e.department_id));

        for (const deptId of toCreateDeptIds) {
          const created = await tx.teacherAssignment.create({
            data: {
              school_id,
              teacher_id,
              class_id,
              subject_id,
              department_id: deptId,
            },
            include: {
              class: { select: { id: true, name: true } },
              subject: { select: { id: true, name: true, code: true } },
              department: { select: { id: true, name: true } },
            },
          });
          results.push(created);
        }
        return results;
      }
    });

    return NextResponse.json({ assignments: createdAssignments }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error('Assign teacher error:', error);
    return NextResponse.json({ error: 'Failed to assign teacher.' }, { status: 500 });
  }
}
