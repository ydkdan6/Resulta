import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireSchoolAccess, verifyTeacherClassAccess, AuthError } from '@/lib/auth/scope';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: classId } = await context.params;

    const classObj = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        school: { select: { id: true, name: true, slug: true } },
        teacherAssignments: {
          include: {
            teacher: { select: { id: true, name: true, email: true } },
            subject: { select: { id: true, name: true, code: true } },
          },
        },
        students: {
          select: {
            id: true,
            admission_number: true,
            full_name: true,
            status: true,
          },
          orderBy: { admission_number: 'asc' },
        },
      },
    });

    if (!classObj) {
      return NextResponse.json({ error: 'Class not found.' }, { status: 404 });
    }

    // Tenant Isolation Check: School A cannot read School B data
    requireSchoolAccess(session, classObj.school_id);

    // Teacher Restriction Check: A teacher cannot see classes they are not assigned to
    if (session.role === 'teacher') {
      await verifyTeacherClassAccess(session.id, classObj.school_id, classObj.id);
    }

    return NextResponse.json({ class: classObj });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error('Error fetching class details:', error);
    return NextResponse.json({ error: 'Failed to retrieve class details.' }, { status: 500 });
  }
}
