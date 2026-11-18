// src/app/api/staff/complaints/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { ParentComplaintSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import { logger } from '@/lib/logger';

/**
 * GET /api/staff/complaints?termId=&status=
 * Lists complaints for the school_admin's school.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
      throw new AuthError('School administrator privileges required.', 403);
    }
    const school_id = session.school_id;
    if (!school_id) {
      throw new AuthError('School context missing.', 400);
    }

    const url = new URL(request.url);
    const termId = url.searchParams.get('termId');
    const status = url.searchParams.get('status');

    const where: Record<string, unknown> = { school_id };
    if (termId) where.term_id = termId;
    if (status && ['PENDING', 'RESOLVED', 'DISMISSED'].includes(status)) {
      where.status = status;
    }

    const complaints = await prisma.complaint.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            admission_number: true,
            full_name: true,
            class: { select: { id: true, name: true } },
          },
        },
        term: {
          select: { id: true, session: true, term_number: true },
        },
      },
    });

    return NextResponse.json({ complaints });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error('[api/staff/complaints GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/staff/complaints
 * Public endpoint for parents reporting "I have paid"
 * Body: { schoolSlug: string, studentAdmissionNumber: string, termId?: string, message: string }
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(ParentComplaintSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { schoolSlug, studentAdmissionNumber, termId, message } = validation.data;

    // 1. Find school by slug
    const school = await prisma.school.findUnique({
      where: { slug: schoolSlug },
      select: { id: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 });
    }

    // 2. Find student by admission number in this school
    const student = await prisma.student.findFirst({
      where: {
        school_id: school.id,
        admission_number: studentAdmissionNumber.trim(),
      },
      select: { id: true },
    });
    if (!student) {
      return NextResponse.json(
        { error: 'Student with this admission number was not found in the school.' },
        { status: 404 }
      );
    }

    // 3. Resolve term: either provided termId or active/latest term for this school
    let resolvedTermId = termId;
    if (!resolvedTermId) {
      const latestTerm = await prisma.term.findFirst({
        where: { school_id: school.id },
        orderBy: [{ session: 'desc' }, { term_number: 'desc' }],
        select: { id: true },
      });
      if (!latestTerm) {
        return NextResponse.json({ error: 'No term found for this school.' }, { status: 404 });
      }
      resolvedTermId = latestTerm.id;
    } else {
      const termCheck = await prisma.term.findUnique({
        where: { id: resolvedTermId },
        select: { school_id: true },
      });
      if (!termCheck || termCheck.school_id !== school.id) {
        return NextResponse.json({ error: 'Invalid term specified.' }, { status: 400 });
      }
    }

    // 4. Create complaint
    const complaint = await prisma.complaint.create({
      data: {
        school_id: school.id,
        student_id: student.id,
        term_id: resolvedTermId,
        message: message.trim(),
        status: 'PENDING',
      },
    });

    return NextResponse.json(
      {
        success: true,
        complaint_id: complaint.id,
        message: 'Your report has been received and sent to the school administration.',
      },
      { status: 201 }
    );
  } catch (e: unknown) {
    logger.error('[api/staff/complaints POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
