import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireSchoolAccess, AuthError } from '@/lib/auth/scope';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { UpdateSchoolSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);

    // Teachers cannot modify school metadata
    if (session.role === 'teacher') {
      return NextResponse.json(
        { error: 'Forbidden: Teachers cannot modify school settings.' },
        { status: 403 }
      );
    }

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(UpdateSchoolSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { school_id, name, logo_url } = validation.data;

    // Tenant Isolation Check: School A cannot modify School B data
    requireSchoolAccess(session, school_id);

    const updatedSchool = await prisma.school.update({
      where: { id: school_id },
      data: {
        ...(name ? { name: name.trim() } : {}),
        ...(logo_url !== undefined ? { logo_url } : {}),
      },
    });

    return NextResponse.json({ school: updatedSchool });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error('Update school error:', error);
    return NextResponse.json({ error: 'Failed to update school.' }, { status: 500 });
  }
}
