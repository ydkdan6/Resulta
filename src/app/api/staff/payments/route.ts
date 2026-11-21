// src/app/api/staff/payments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { MarkPaymentsSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Snapshot the school's current platform_share.
 * Called inside the transaction so the value is consistent with the moment
 * the payment is marked.
 */
async function getSchoolShare(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<Prisma.Decimal> {
  const school = await tx.school.findUnique({
    where: { id: schoolId },
    select: { platform_share: true },
  });
  return school?.platform_share ?? new Prisma.Decimal(1000);
}

/**
 * GET /api/staff/payments?termId=
 * Returns payment tracking data: students marked paid, amounts.
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
    if (!termId) {
      return NextResponse.json({ error: 'termId query parameter is required' }, { status: 400 });
    }

    // Verify term belongs to school
    const term = await prisma.term.findUnique({
      where: { id: termId },
    });
    if (!term || term.school_id !== school_id) {
      return NextResponse.json({ error: 'Term not found for your school' }, { status: 404 });
    }

    // Get school pricing config
    const school = await prisma.school.findUnique({
      where: { id: school_id },
      select: { platform_share: true, card_price: true },
    });

    if (!school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    }

    const platformShareNum = Number(school.platform_share);
    const cardPriceNum = Number(school.card_price);

    // Fetch active students with term status
    const students = await prisma.student.findMany({
      where: { school_id, status: 'ACTIVE' },
      orderBy: [{ class: { name: 'asc' } }, { full_name: 'asc' }],
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

    const formattedStudents = students.map((s) => {
      const termStatus = s.termStatuses[0];
      return {
        id: s.id,
        admission_number: s.admission_number,
        full_name: s.full_name,
        class_name: s.class?.name || 'Unassigned',
        fees_paid: termStatus?.fees_paid ?? false,
        result_locked: termStatus?.result_locked ?? false,
      };
    });

    const paidCount = formattedStudents.filter((s) => s.fees_paid).length;
    const totalAmountOwed = paidCount * platformShareNum;
    const schoolSharePerStudent = cardPriceNum - platformShareNum;

    return NextResponse.json({
      students: formattedStudents,
      batches: [], // kept for client backwards-compat; always empty now
      platform_share: platformShareNum,
      card_price: cardPriceNum,
      stats: {
        total_students: formattedStudents.length,
        paid_count: paidCount,
        amount_owed: totalAmountOwed,
        school_share_per_student: schoolSharePerStudent,
      },
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error('[api/staff/payments GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/staff/payments
 * Marks students as paid (fees_paid = true) in one transaction and creates
 * a SHARE_DUE ledger entry for each student newly marked paid.
 *
 * Idempotency: uses updateMany(where fees_paid=false). If the row was
 * already paid the updateMany count is 0 and no ledger entry is created.
 *
 * Body: { termId: string, studentIds: string[] }
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
    const validation = validateInput(MarkPaymentsSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { termId, studentIds } = validation.data;

    // Verify term belongs to school
    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term || term.school_id !== school_id) {
      return NextResponse.json({ error: 'Term not found for your school.' }, { status: 404 });
    }

    // Verify all studentIds belong to this school and are ACTIVE
    const studentsInSchool = await prisma.student.findMany({
      where: { id: { in: studentIds }, school_id, status: 'ACTIVE' },
      select: { id: true },
    });
    if (studentsInSchool.length !== studentIds.length) {
      return NextResponse.json(
        { error: 'One or more students do not belong to this school or are not active.' },
        { status: 403 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Snapshot the platform share at this exact moment
      const platformShare = await getSchoolShare(tx, school_id);

      let newlyPaidCount = 0;

      for (const studentId of studentIds) {
        // 1. Ensure the StudentTermStatus row exists
        await tx.studentTermStatus.upsert({
          where: { student_id_term_id: { student_id: studentId, term_id: termId } },
          update: {}, // handled below
          create: {
            school_id,
            student_id: studentId,
            term_id: termId,
            fees_paid: false,
            result_locked: false,
          },
        });

        // 2. Atomically flip fees_paid only if it is currently false
        const updated = await tx.studentTermStatus.updateMany({
          where: {
            student_id: studentId,
            term_id: termId,
            fees_paid: false,
          },
          data: { fees_paid: true },
        });

        // 3. Create SHARE_DUE only when the row was actually changed
        if (updated.count > 0) {
          await tx.shareLedgerEntry.create({
            data: {
              school_id,
              student_id: studentId,
              term_id: termId,
              type: 'SHARE_DUE',
              amount: platformShare,
              marked_by_user_id: session.id,
            },
          });
          newlyPaidCount++;
        }
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          school_id,
          user_id: session.id,
          action: 'MARK_STUDENTS_PAID',
          entity: 'StudentTermStatus',
          entity_id: termId,
          new_values: {
            count: studentIds.length,
            newly_paid: newlyPaidCount,
            already_paid: studentIds.length - newlyPaidCount,
          },
        },
      });

      return { updatedCount: studentIds.length, newlyPaidCount };
    });

    return NextResponse.json({
      success: true,
      updated_count: result.updatedCount,
      newly_paid_count: result.newlyPaidCount,
      already_paid_count: result.updatedCount - result.newlyPaidCount,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error('[api/staff/payments POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
