import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin, AuthError } from '@/lib/auth/scope';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    // Explicit rule: school_admin CANNOT create assignments. Only platform_admin can.
    await requirePlatformAdmin();

    const body = await request.json();
    const { school_id, teacher_id, class_id, subject_id } = body;

    if (!school_id || !teacher_id || !class_id || !subject_id) {
      return NextResponse.json(
        { error: 'school_id, teacher_id, class_id, and subject_id are all required.' },
        { status: 400 }
      );
    }

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

    // Upsert assignment to prevent duplicate errors
    const assignment = await prisma.teacherAssignment.upsert({
      where: {
        school_id_teacher_id_class_id_subject_id: {
          school_id,
          teacher_id,
          class_id,
          subject_id,
        },
      },
      update: {},
      create: {
        school_id,
        teacher_id,
        class_id,
        subject_id,
      },
      include: {
        class: { select: { id: true, name: true } },
        subject: { select: { id: true, name: true, code: true } },
      },
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Assign teacher error:', error);
    return NextResponse.json({ error: 'Failed to assign teacher.' }, { status: 500 });
  }
}
