import { NextResponse } from 'next/server';
import { requireAuth, getTeacherAssignedClasses, AuthError } from '@/lib/auth/scope';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';






// Force dynamic rendering – needed because we read cookies/session.

// export const revalidate = 0;
// export const instant = false;




export async function GET() {
  try {
    const session = await requireAuth();

    if (!session.school_id) {
      return NextResponse.json({ error: 'User is not associated with any school.' }, { status: 400 });
    }

    // Teacher – only their assigned classes
    if (session.role === 'teacher') {
      const classes = await getTeacherAssignedClasses(session.id, session.school_id);
      return NextResponse.json({ classes });
    }

    // School admin or platform admin – all classes in the school
    if (session.role === 'school_admin' || session.role === 'platform_admin') {
      const classes = await prisma.class.findMany({
        where: { school_id: session.school_id },
        include: {
          _count: { select: { students: true } },
          teacherAssignments: {
            include: {
              teacher: { select: { id: true, name: true, email: true } },
              subject: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      });
      return NextResponse.json({ classes });
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error('Error fetching classes:', error);
    return NextResponse.json({ error: 'Failed to retrieve classes.' }, { status: 500 });
  }
}
