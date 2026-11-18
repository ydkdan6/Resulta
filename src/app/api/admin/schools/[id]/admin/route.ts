import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin, AuthError } from '@/lib/auth/scope';
import { hashPassword, generateTemporaryPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/prisma';
import { Role } from '@prisma/client';
import { logger } from '@/lib/logger';
import { AdminCreateAdminSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin();
    const { id: schoolId } = await context.params;

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 });
    }

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(AdminCreateAdminSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { name, email, password } = validation.data;
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required for the school administrator.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'A user with this email already exists.' },
        { status: 400 }
      );
    }

    const plainPassword = password || generateTemporaryPassword();
    const passwordHash = await hashPassword(plainPassword);

    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        name: name.trim(),
        password_hash: passwordHash,
        role: Role.school_admin,
        school_id: school.id,
        must_change_password: true,
      },
    });

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          school_id: user.school_id,
        },
        temporaryPassword: plainPassword,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error('Create school admin error:', error);
    return NextResponse.json({ error: 'Failed to create school administrator.' }, { status: 500 });
  }
}
