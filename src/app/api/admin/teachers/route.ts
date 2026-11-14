import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin, AuthError } from '@/lib/auth/scope';
import { hashPassword, generateTemporaryPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin();
    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('school_id');

    const teachers = await prisma.user.findMany({
      where: {
        role: Role.teacher,
        ...(schoolId ? { school_id: schoolId } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        school_id: true,
        school: {
          select: { name: true, slug: true },
        },
        must_change_password: true,
        created_at: true,
        teacherAssignments: {
          include: {
            class: { select: { id: true, name: true } },
            subject: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ teachers });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json({ error: 'Failed to retrieve teachers.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Explicit rule: school_admin CANNOT create teachers. Only platform_admin can.
    await requirePlatformAdmin();

    const body = await request.json();
    const { school_id, name, email, password } = body;

    if (!school_id || !name || !email) {
      return NextResponse.json(
        { error: 'School ID, name, and email are required to create a teacher.' },
        { status: 400 }
      );
    }

    const school = await prisma.school.findUnique({
      where: { id: school_id },
    });

    if (!school) {
      return NextResponse.json({ error: 'Target school not found.' }, { status: 404 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A user with this email address already exists.' },
        { status: 400 }
      );
    }

    const tempPassword = password || generateTemporaryPassword();
    const passwordHash = await hashPassword(tempPassword);

    const teacher = await prisma.user.create({
      data: {
        email: cleanEmail,
        name: name.trim(),
        password_hash: passwordHash,
        role: Role.teacher,
        school_id: school.id,
        must_change_password: true,
      },
    });

    return NextResponse.json(
      {
        teacher: {
          id: teacher.id,
          name: teacher.name,
          email: teacher.email,
          role: teacher.role,
          school_id: teacher.school_id,
          must_change_password: teacher.must_change_password,
        },
        temporaryPassword: tempPassword,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Create teacher error:', error);
    return NextResponse.json({ error: 'Failed to create teacher.' }, { status: 500 });
  }
}
