// src/app/api/staff/pins/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { generateSecurePin, hashPin } from '@/lib/auth/pin';

/**
 * POST /api/staff/pins/generate
 * Generates PIN cards for students in a term.
 *
 * GATING CRITERIA:
 * 1. Student must belong to this school and be ACTIVE.
 * 2. Student must have fees_paid = true in StudentTermStatus for this term.
 * 3. The student's result must NOT be locked (result_locked === false).
 * 4. CRITICAL GATE: There must be at least one CONFIRMED PaymentBatch for this school and term!
 *    PIN generation is impossible for students outside a confirmed batch.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
      throw new AuthError('School administrator privileges required.', 403);
    }
    const school_id = session.school_id;
    if (!school_id) {
      throw new AuthError('School context missing.', 400);
    }

    const body = await request.json();
    const { termId, studentIds } = body || {};

    if (!termId || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'termId and non-empty studentIds array are required.' },
        { status: 400 }
      );
    }

    // Verify term belongs to school
    const term = await prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, school_id: true, session: true, term_number: true },
    });
    if (!term || term.school_id !== school_id) {
      return NextResponse.json({ error: 'Term not found for your school.' }, { status: 404 });
    }

    // CRITICAL GATE: Check if there is any CONFIRMED payment batch for this school and term
    const confirmedBatch = await prisma.paymentBatch.findFirst({
      where: {
        school_id,
        term_id: termId,
        status: 'CONFIRMED',
      },
    });

    if (!confirmedBatch) {
      return NextResponse.json(
        {
          error:
            'PIN generation is impossible without a confirmed payment batch. The platform administrator must confirm payment received first.',
        },
        { status: 403 }
      );
    }

    // Check each student's payment status and result withholding status
    const studentsWithStatus = await prisma.student.findMany({
      where: {
        id: { in: studentIds },
        school_id,
      },
      select: {
        id: true,
        admission_number: true,
        full_name: true,
        status: true,
        termStatuses: {
          where: { term_id: termId },
          select: { fees_paid: true, result_locked: true },
        },
      },
    });

    if (studentsWithStatus.length !== studentIds.length) {
      return NextResponse.json(
        { error: 'One or more students do not belong to this school.' },
        { status: 400 }
      );
    }

    // Validate eligibility for each student
    const ineligibleStudents: { admission_number: string; reason: string }[] = [];
    const eligibleStudents: typeof studentsWithStatus = [];

    for (const student of studentsWithStatus) {
      const termStatus = student.termStatuses[0];
      if (!termStatus || !termStatus.fees_paid) {
        ineligibleStudents.push({
          admission_number: student.admission_number,
          reason: 'Fees not marked as paid for this term.',
        });
      } else if (termStatus.result_locked) {
        ineligibleStudents.push({
          admission_number: student.admission_number,
          reason: 'Result is withheld (locked) by administration.',
        });
      } else {
        eligibleStudents.push(student);
      }
    }

    if (eligibleStudents.length === 0) {
      return NextResponse.json(
        {
          error: 'No eligible students for PIN generation.',
          details: ineligibleStudents,
        },
        { status: 403 }
      );
    }

    // Generate PINs for eligible students
    const generatedPins: {
      student_id: string;
      admission_number: string;
      full_name: string;
      plain_pin: string;
    }[] = [];

    await prisma.$transaction(async (tx) => {
      for (const student of eligibleStudents) {
        const plainPin = generateSecurePin(6);
        const pinHash = hashPin(plainPin);

        // Revoke any previous active PIN for this student + term
        await tx.pin.updateMany({
          where: {
            school_id,
            student_id: student.id,
            term_id: termId,
            status: 'ACTIVE',
          },
          data: { status: 'REVOKED' },
        });

        // Create new PIN
        await tx.pin.create({
          data: {
            school_id,
            student_id: student.id,
            term_id: termId,
            pin_hash: pinHash,
            status: 'ACTIVE',
          },
        });

        generatedPins.push({
          student_id: student.id,
          admission_number: student.admission_number,
          full_name: student.full_name,
          plain_pin: plainPin,
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          school_id,
          user_id: session.id,
          action: 'GENERATE_PINS',
          entity: 'Pin',
          entity_id: termId,
          new_values: {
            count: generatedPins.length,
            term_id: termId,
            batch_id: confirmedBatch.id,
          },
        },
      });
    });

    return NextResponse.json({
      success: true,
      generated_count: generatedPins.length,
      ineligible_count: ineligibleStudents.length,
      ineligible: ineligibleStudents,
      pins: generatedPins,
      message: `Successfully generated ${generatedPins.length} PINs. Store or print them now; plain PINs are never stored.`,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error('[api/staff/pins/generate POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
