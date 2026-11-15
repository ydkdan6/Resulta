// src/app/api/parent/complaints/route.ts
//
// Public endpoint reachable from results subdomains (e.g. kingscollege.localhost:3000).
// The middleware allows /api/parent/* through without a staff session, so this route
// must do its own input validation instead of relying on requireAuth.
//
// POST /api/parent/complaints
// Body: { schoolSlug, studentAdmissionNumber, termId?, message }

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const { schoolSlug, studentAdmissionNumber, termId, message } = body as {
      schoolSlug?: string;
      studentAdmissionNumber?: string;
      termId?: string;
      message?: string;
    };

    if (!schoolSlug?.trim() || !studentAdmissionNumber?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: 'schoolSlug, studentAdmissionNumber, and message are required.' },
        { status: 400 }
      );
    }

    // 1. Resolve school
    const school = await prisma.school.findUnique({
      where: { slug: schoolSlug.trim() },
      select: { id: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 });
    }

    // 2. Resolve student
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

    // 3. Resolve term
    let resolvedTermId = termId?.trim() || null;
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
    console.error('[api/parent/complaints POST]', e);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
