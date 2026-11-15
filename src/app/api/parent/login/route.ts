// src/app/api/parent/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPin } from '@/lib/auth/pin';
import { createParentSessionToken, PARENT_SESSION_COOKIE } from '@/lib/auth/parentSession';
import { checkRateLimit, recordFailedAttempt, resetAttempts } from '@/lib/auth/parentRateLimit';

/**
 * POST /api/parent/login
 * Body: { admissionNumber: string, pin: string, schoolSlug?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const body = await request.json();
    const { admissionNumber, pin, schoolSlug: rawSlug } = body || {};

    // Determine school slug from header or body
    const headerSlug = request.headers.get('x-school-slug');
    const slug = headerSlug || rawSlug;

    if (!slug) {
      return NextResponse.json({ error: 'School context missing.' }, { status: 400 });
    }

    if (!admissionNumber || !pin) {
      return NextResponse.json(
        { error: 'Invalid admission number or PIN.' },
        { status: 400 }
      );
    }

    // 1. Rate limiting by IP and by admission number
    const rateCheck = checkRateLimit(ip, admissionNumber);
    if (rateCheck.locked) {
      return NextResponse.json(
        {
          error: `Too many failed attempts. Temporary lockout in effect for ${rateCheck.remainingLockoutSeconds}s.`,
        },
        { status: 429 }
      );
    }

    // 2. Find school
    const school = await prisma.school.findUnique({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'Invalid admission number or PIN.' }, { status: 401 });
    }

    // 3. Find student in this school
    const student = await prisma.student.findFirst({
      where: {
        school_id: school.id,
        admission_number: admissionNumber.trim(),
      },
      select: {
        id: true,
        school_id: true,
        admission_number: true,
        full_name: true,
        status: true,
      },
    });
    if (!student) {
      recordFailedAttempt(ip, admissionNumber);
      return NextResponse.json({ error: 'Invalid admission number or PIN.' }, { status: 401 });
    }

    // 4. Retrieve PIN records for this student
    const studentPins = await prisma.pin.findMany({
      where: {
        school_id: school.id,
        student_id: student.id,
      },
      include: {
        term: true,
      },
      orderBy: { created_at: 'desc' },
    });

    if (studentPins.length === 0) {
      recordFailedAttempt(ip, admissionNumber);
      return NextResponse.json({ error: 'Invalid admission number or PIN.' }, { status: 401 });
    }

    // 5. Match PIN
    let matchedPin = null;
    for (const p of studentPins) {
      if (verifyPin(pin.trim(), p.pin_hash)) {
        matchedPin = p;
        break;
      }
    }

    if (!matchedPin) {
      recordFailedAttempt(ip, admissionNumber);
      return NextResponse.json({ error: 'Invalid admission number or PIN.' }, { status: 401 });
    }

    // Check expiration or status
    if (matchedPin.status === 'EXPIRED') {
      return NextResponse.json(
        { error: "This card has expired. Please use the current term's card." },
        { status: 401 }
      );
    }

    if (matchedPin.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Invalid admission number or PIN.' },
        { status: 401 }
      );
    }

    // Check login count limit (Default 10)
    if (matchedPin.logins_used >= matchedPin.max_logins) {
      return NextResponse.json(
        { error: "This card has expired. Please use the current term's card." },
        { status: 403 }
      );
    }

    // Check if result is withheld for this student and term
    const termStatus = await prisma.studentTermStatus.findUnique({
      where: {
        student_id_term_id: {
          student_id: student.id,
          term_id: matchedPin.term_id,
        },
      },
      select: { result_locked: true },
    });

    if (termStatus?.result_locked) {
      return NextResponse.json(
        { error: 'Result not released. Please contact the school.' },
        { status: 403 }
      );
    }

    // One login counts as one use -> increment logins_used
    await prisma.pin.update({
      where: { id: matchedPin.id },
      data: { logins_used: { increment: 1 } },
    });

    // Reset rate limiter on success
    resetAttempts(ip, admissionNumber);

    // Create session token (30 min lifetime)
    const token = await createParentSessionToken({
      student_id: student.id,
      admission_number: student.admission_number,
      full_name: student.full_name,
      school_id: school.id,
      school_slug: school.slug,
      pin_id: matchedPin.id,
      pin_term_id: matchedPin.term_id,
      pin_session: matchedPin.term.session,
      pin_term_number: matchedPin.term.term_number,
    });

    const response = NextResponse.json({
      success: true,
      student: {
        admission_number: student.admission_number,
        full_name: student.full_name,
      },
      term: {
        id: matchedPin.term_id,
        session: matchedPin.term.session,
        term_number: matchedPin.term.term_number,
      },
      logins_remaining: matchedPin.max_logins - (matchedPin.logins_used + 1),
    });

    response.cookies.set(PARENT_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 60, // 30 minutes
    });

    return response;
  } catch (e: unknown) {
    console.error('[api/parent/login POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
