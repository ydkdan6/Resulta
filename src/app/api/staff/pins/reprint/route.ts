// src/app/api/staff/pins/reprint/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { generateRandomPin, hashPin } from '@/lib/auth/pin';
import { generatePinCardsPdf } from '@/lib/cards/generatePdf';
import { platformConfig } from '@/lib/config';
import { ReprintPinSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import { logger } from '@/lib/logger';

/**
 * POST /api/staff/pins/reprint
 *
 * Rules:
 * - Reprint = a new PIN replaces the old one.
 * - It needs a reason and is logged.
 * - Each card belongs to one student only.
 * - Returns the new plain PIN and an optional single-card PDF.
 * Body: { studentId: string, termId: string, reason: string, returnPdf?: boolean }
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

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(ReprintPinSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { studentId, termId, reason, returnPdf } = validation.data;

    // 1. Verify student and term belong to school
    const [student, term, school] = await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          school_id: true,
          admission_number: true,
          full_name: true,
          class: { select: { name: true } },
          termStatuses: {
            where: { term_id: termId },
            select: { fees_paid: true, result_locked: true },
          },
        },
      }),
      prisma.term.findUnique({
        where: { id: termId },
        select: { id: true, school_id: true, session: true, term_number: true },
      }),
      prisma.school.findUnique({
        where: { id: school_id },
        select: { id: true, name: true, slug: true, logo_url: true },
      }),
    ]);

    if (!student || student.school_id !== school_id) {
      return NextResponse.json({ error: 'Student not found in your school.' }, { status: 404 });
    }
    if (!term || term.school_id !== school_id) {
      return NextResponse.json({ error: 'Term not found for your school.' }, { status: 404 });
    }
    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 });
    }

    // 2. Validate payment status and withhold status
    const termStatus = student.termStatuses[0];
    if (!termStatus || !termStatus.fees_paid) {
      return NextResponse.json(
        { error: 'Cannot reprint PIN: Student fees are not marked as paid for this term.' },
        { status: 403 }
      );
    }
    if (termStatus.result_locked) {
      return NextResponse.json(
        { error: 'Cannot reprint PIN: Student result is currently withheld (locked).' },
        { status: 403 }
      );
    }

    // 3. Generate new 10-character PIN and hash with bcrypt
    const newPlainPin = generateRandomPin(10);
    const newPinHash = hashPin(newPlainPin);

    // 4. Atomic transaction: Revoke old PIN, insert new PIN, log reason
    await prisma.$transaction(async (tx) => {
      // Find old active PIN id if any
      const oldPin = await tx.pin.findFirst({
        where: {
          school_id,
          student_id: student.id,
          term_id: term.id,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      // Revoke old PINs for this term
      await tx.pin.updateMany({
        where: {
          school_id,
          student_id: student.id,
          term_id: term.id,
          status: 'ACTIVE',
        },
        data: { status: 'REVOKED' },
      });

      // Create new PIN
      const createdPin = await tx.pin.create({
        data: {
          school_id,
          student_id: student.id,
          term_id: term.id,
          pin_hash: newPinHash,
          max_logins: 10,
          logins_used: 0,
          status: 'ACTIVE',
        },
      });

      // Audit log: records reason, actor, student, old pin id (NEVER plain PIN)
      await tx.auditLog.create({
        data: {
          school_id,
          user_id: session.id,
          action: 'REPRINT_PIN',
          entity: 'Pin',
          entity_id: createdPin.id,
          reason: reason.trim(),
          old_values: {
            replaced_pin_id: oldPin?.id ?? null,
            student_id: student.id,
            term_id: term.id,
          },
          new_values: {
            new_pin_id: createdPin.id,
            student_id: student.id,
            admission_number: student.admission_number,
            max_logins: 10,
            // DO NOT log plain PIN!
          },
        },
      });
    });

    const cardData = {
      schoolName: school.name,
      logoUrl: school.logo_url,
      studentName: student.full_name,
      admissionNumber: student.admission_number,
      className: student.class?.name || 'General',
      termName: `Term ${term.term_number}`,
      session: term.session,
      pin: newPlainPin,
      portalUrl: platformConfig.getSchoolResultsUrl(school.slug),
    };

    if (returnPdf) {
      const pdfBuffer = await generatePinCardsPdf([cardData]);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="pin-reprint-${student.admission_number}.pdf"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      student_id: student.id,
      admission_number: student.admission_number,
      full_name: student.full_name,
      plain_pin: newPlainPin,
      card: cardData,
      message: 'Reprint successful. Old PIN has been revoked and replaced. Download or record the new PIN immediately.',
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error('[api/staff/pins/reprint POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
