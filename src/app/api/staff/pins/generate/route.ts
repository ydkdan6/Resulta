// src/app/api/staff/pins/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { generateRandomPin, hashPin } from '@/lib/auth/pin';
import { generatePinCardsPdf, CardData } from '@/lib/cards/generatePdf';
import { platformConfig } from '@/lib/config';
import { GeneratePinsSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import { logger } from '@/lib/logger';

/**
 * POST /api/staff/pins/generate
 * Generates PINs and creates a print-ready PDF for a confirmed batch.
 *
 * Rules:
 * - When school_admin clicks 'Generate cards' for a confirmed batch, create a random
 *   10-character PIN per student (no look-alike characters).
 * - Store only a hash (bcrypt) and return the plain PINs once in the response.
 * - If format=pdf or pdf: true requested, returns the print-ready PDF binary.
 * - Generating a new term's PINs expires the previous term's PINs.
 * - Defaults: max_logins 10 per PIN.
 * - PIN is strictly for one student and one term.
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
    const validation = validateInput(GeneratePinsSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { termId, studentIds, batchId, returnPdf } = validation.data;

    // 1. Verify term belongs to school
    const term = await prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, school_id: true, session: true, term_number: true },
    });
    if (!term || term.school_id !== school_id) {
      return NextResponse.json({ error: 'Term not found for your school.' }, { status: 404 });
    }

    // 2. School details
    const school = await prisma.school.findUnique({
      where: { id: school_id },
      select: { id: true, name: true, slug: true, logo_url: true },
    });
    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 });
    }

    // 3. CRITICAL GATE: Verify there is a CONFIRMED PaymentBatch for this school and term
    const confirmedBatch = await prisma.paymentBatch.findFirst({
      where: {
        school_id,
        term_id: termId,
        status: 'CONFIRMED',
        ...(batchId ? { id: batchId } : {}),
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

    // 4. Resolve target students
    let targetStudentIds: string[] = [];
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      targetStudentIds = studentIds;
    } else {
      // If batchId or all students for term, select students marked fees_paid = true
      const paidStatuses = await prisma.studentTermStatus.findMany({
        where: {
          school_id,
          term_id: termId,
          fees_paid: true,
          result_locked: false,
        },
        select: { student_id: true },
      });
      targetStudentIds = paidStatuses.map((s) => s.student_id);
    }

    if (targetStudentIds.length === 0) {
      return NextResponse.json(
        { error: 'No paid students found to generate PINs for.' },
        { status: 400 }
      );
    }

    // Fetch student objects with their class & term status
    const students = await prisma.student.findMany({
      where: {
        id: { in: targetStudentIds },
        school_id,
      },
      select: {
        id: true,
        admission_number: true,
        full_name: true,
        status: true,
        class: { select: { id: true, name: true } },
        termStatuses: {
          where: { term_id: termId },
          select: { fees_paid: true, result_locked: true },
        },
      },
    });

    // Validate eligibility
    const ineligibleStudents: { admission_number: string; reason: string }[] = [];
    const eligibleStudents: typeof students = [];

    for (const student of students) {
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

    // 5. Generate 10-character PINs with safe characters & hash with bcrypt
    const generatedPins: {
      student_id: string;
      admission_number: string;
      full_name: string;
      class_name: string;
      plain_pin: string;
    }[] = [];

    const cardsForPdf: CardData[] = [];
    const portalUrl = platformConfig.getSchoolResultsUrl(school.slug);

    await prisma.$transaction(async (tx) => {
      // Rule: Generating a new term's PINs expires the previous term's PINs for these students
      // Find all earlier terms for this school
      const earlierTerms = await tx.term.findMany({
        where: {
          school_id,
          id: { not: termId },
          OR: [
            { session: { lt: term.session } },
            {
              session: term.session,
              term_number: { lt: term.term_number },
            },
          ],
        },
        select: { id: true },
      });

      const earlierTermIds = earlierTerms.map((t) => t.id);
      if (earlierTermIds.length > 0) {
        await tx.pin.updateMany({
          where: {
            school_id,
            student_id: { in: eligibleStudents.map((s) => s.id) },
            term_id: { in: earlierTermIds },
            status: 'ACTIVE',
          },
          data: { status: 'EXPIRED' },
        });
      }

      for (const student of eligibleStudents) {
        const plainPin = generateRandomPin(10);
        const pinHash = hashPin(plainPin);

        // Revoke any previous active PIN for this student in the same term
        await tx.pin.updateMany({
          where: {
            school_id,
            student_id: student.id,
            term_id: termId,
            status: 'ACTIVE',
          },
          data: { status: 'REVOKED' },
        });

        // Insert new PIN: max_logins defaults to 10
        await tx.pin.create({
          data: {
            school_id,
            student_id: student.id,
            term_id: termId,
            pin_hash: pinHash,
            max_logins: 10,
            logins_used: 0,
            status: 'ACTIVE',
          },
        });

        const className = student.class?.name || 'General';
        generatedPins.push({
          student_id: student.id,
          admission_number: student.admission_number,
          full_name: student.full_name,
          class_name: className,
          plain_pin: plainPin,
        });

        cardsForPdf.push({
          schoolName: school.name,
          logoUrl: school.logo_url,
          studentName: student.full_name,
          admissionNumber: student.admission_number,
          className,
          termName: `Term ${term.term_number}`,
          session: term.session,
          pin: plainPin,
          portalUrl,
        });
      }

      // Audit log: Note that plain PINs are NEVER written to logs!
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
            // Do NOT log plain_pin
          },
        },
      });
    });

    // If PDF output requested directly
    if (returnPdf) {
      const pdfBuffer = await generatePinCardsPdf(cardsForPdf);
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="pin-cards-${school.slug}-term${term.term_number}.pdf"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      generated_count: generatedPins.length,
      ineligible_count: ineligibleStudents.length,
      ineligible: ineligibleStudents,
      pins: generatedPins,
      message: `Generated ${generatedPins.length} PINs successfully. Download your PDF now; plain PINs cannot be viewed again.`,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error('[api/staff/pins/generate POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
