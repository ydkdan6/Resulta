import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireSchoolAccess, AuthError } from '@/lib/auth/scope';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Teachers cannot modify school metadata
    if (session.role === 'teacher') {
      return NextResponse.json(
        { error: 'Forbidden: Teachers cannot modify school settings.' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { school_id, name, logo_url } = body;

    if (!school_id) {
      return NextResponse.json({ error: 'school_id is required.' }, { status: 400 });
    }

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
    console.error('Update school error:', error);
    return NextResponse.json({ error: 'Failed to update school.' }, { status: 500 });
  }
}
