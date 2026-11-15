// src/app/api/results/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPin } from '@/lib/auth/pin';

/**
 * POST /api/results/login
 * Validates a parent's PIN login on a school's results portal.
 *
 * Rules from BRIEF.md:
 * - Parents log in with admission number + current term's PIN.
 * - Each PIN card is for one particular student and one term.
 * - Store only a hash, never the plain PIN.
 * - A PIN opens its own term and all earlier published terms, never later terms.
 * - Card for student A cannot open student B.
 * - Expired or revoked PINs fail.
 * - Withheld (result_locked) results are blocked.
 * - Increments logins_used up to max_logins (default 10).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { schoolSlug, admissionNumber, pin } = body || {};

    if (!schoolSlug || !admissionNumber || !pin) {
      return NextResponse.json(
        { error: 'schoolSlug, admissionNumber, and pin are required.' },
        { status: 400 }
      );
    }

    // 1. Find school
    const school = await prisma.school.findUnique({
      where: { slug: schoolSlug },
      select: { id: true, name: true, slug: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 });
    }

    // 2. Find student in this school
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
      return NextResponse.json({ error: 'Invalid admission number or PIN.' }, { status: 401 });
    }

    // 3. Find active PIN candidates for this student
    const activePins = await prisma.pin.findMany({
      where: {
        school_id: school.id,
        student_id: student.id,
        status: 'ACTIVE',
      },
      include: {
        term: true,
      },
    });

    if (activePins.length === 0) {
      return NextResponse.json(
        { error: 'No active PIN found for this student. Expired or invalid PIN.' },
        { status: 401 }
      );
    }

    // 4. Verify submitted PIN against stored hash
    let matchedPin = null;
    for (const p of activePins) {
      if (verifyPin(pin.trim(), p.pin_hash)) {
        matchedPin = p;
        break;
      }
    }

    if (!matchedPin) {
      return NextResponse.json({ error: 'Invalid admission number or PIN.' }, { status: 401 });
    }

    // Check login count limit
    if (matchedPin.logins_used >= matchedPin.max_logins) {
      return NextResponse.json(
        { error: 'PIN login limit exceeded (maximum logins reached).' },
        { status: 403 }
      );
    }

    // Check if result is withheld for this term
    const termStatus = await prisma.studentTermStatus.findUnique({
      where: {
        student_id_term_id: {
          student_id: student.id,
          term_id: matchedPin.term_id,
        },
      },
    });

    if (termStatus?.result_locked) {
      return NextResponse.json(
        { error: 'Results for this term are withheld. Please contact the school bursar/administration.' },
        { status: 403 }
      );
    }

    // Increment logins_used
    await prisma.pin.update({
      where: { id: matchedPin.id },
      data: { logins_used: { increment: 1 } },
    });

    return NextResponse.json({
      success: true,
      student: {
        id: student.id,
        admission_number: student.admission_number,
        full_name: student.full_name,
      },
      term: {
        id: matchedPin.term.id,
        session: matchedPin.term.session,
        term_number: matchedPin.term.term_number,
      },
      logins_remaining: matchedPin.max_logins - (matchedPin.logins_used + 1),
    });
  } catch (e: unknown) {
    console.error('[api/results/login POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
