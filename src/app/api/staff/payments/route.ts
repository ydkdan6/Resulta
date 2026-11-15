// src/app/api/staff/payments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { Prisma } from '@prisma/client';

/**
 * GET /api/staff/payments?termId=
 * Returns payment tracking data: students marked paid, amounts, and batches.
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

    const platformShareNum = school?.platform_share ? Number(school.platform_share) : 1000;
    const cardPriceNum = school?.card_price ? Number(school.card_price) : 2000;

    // Fetch active students in school with class and their status for this term
    const [students, batches] = await Promise.all([
      prisma.student.findMany({
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
      }),
      prisma.paymentBatch.findMany({
        where: { school_id, term_id: termId },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          students_count: true,
          amount_due: true,
          amount_received: true,
          status: true,
          confirmed_at: true,
          created_at: true,
        },
      }),
    ]);

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

    return NextResponse.json({
      students: formattedStudents,
      batches,
      platform_share: platformShareNum,
      card_price: cardPriceNum,
      stats: {
        total_students: formattedStudents.length,
        paid_count: paidCount,
        amount_owed: totalAmountOwed,
      },
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error('[api/staff/payments GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/staff/payments/mark
 * Marks students as paid (fees_paid = true) and optionally creates a PaymentBatch.
 * Body: { termId: string, studentIds: string[], createBatch?: boolean }
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
    const { termId, studentIds, createBatch } = body || {};

    if (!termId || !Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { error: 'termId and a non-empty studentIds array are required.' },
        { status: 400 }
      );
    }

    // Verify term belongs to school
    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term || term.school_id !== school_id) {
      return NextResponse.json({ error: 'Term not found for your school.' }, { status: 404 });
    }

    // Verify all studentIds belong to this school
    const studentsInSchool = await prisma.student.findMany({
      where: { id: { in: studentIds }, school_id },
      select: {
        id: true,
        admission_number: true,
        full_name: true,
        termStatuses: {
          where: { term_id: termId },
          select: { fees_paid: true },
        },
      },
    });
    if (studentsInSchool.length !== studentIds.length) {
      return NextResponse.json(
        { error: 'One or more students do not belong to this school.' },
        { status: 403 }
      );
    }

    // When creating a batch, prevent including students who are already marked as paid
    if (createBatch) {
      const alreadyPaidStudents = studentsInSchool.filter(
        (s) => s.termStatuses[0]?.fees_paid
      );
      if (alreadyPaidStudents.length > 0) {
        const names = alreadyPaidStudents
          .map((s) => `${s.full_name} (${s.admission_number})`)
          .join(', ');
        return NextResponse.json(
          {
            error: `Cannot create batch: ${alreadyPaidStudents.length} student(s) have already been marked as paid for this term: ${names}.`,
            already_paid: alreadyPaidStudents.map((s) => s.id),
          },
          { status: 409 }
        );
      }
    }

    const school = await prisma.school.findUnique({
      where: { id: school_id },
      select: { platform_share: true },
    });
    const platformShare = school?.platform_share ? Number(school.platform_share) : 1000;
    const amountDue = new Prisma.Decimal(platformShare * studentIds.length);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Mark each student as fees_paid = true
      for (const studentId of studentIds) {
        await tx.studentTermStatus.upsert({
          where: {
            student_id_term_id: { student_id: studentId, term_id: termId },
          },
          update: {
            fees_paid: true,
          },
          create: {
            school_id,
            student_id: studentId,
            term_id: termId,
            fees_paid: true,
            result_locked: false,
          },
        });
      }

      // 2. Optionally create PaymentBatch
      let batch = null;
      if (createBatch) {
        batch = await tx.paymentBatch.create({
          data: {
            school_id,
            term_id: termId,
            students_count: studentIds.length,
            amount_due: amountDue,
            amount_received: new Prisma.Decimal(0),
            status: 'PENDING',
          },
        });
      }

      // 3. Audit log
      await tx.auditLog.create({
        data: {
          school_id,
          user_id: session.id,
          action: 'MARK_STUDENTS_PAID',
          entity: 'StudentTermStatus',
          entity_id: termId,
          new_values: {
            count: studentIds.length,
            student_ids: studentIds,
            batch_id: batch?.id ?? null,
          },
        },
      });

      return { updatedCount: studentIds.length, batch };
    });

    return NextResponse.json({
      success: true,
      updated_count: result.updatedCount,
      batch: result.batch,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error('[api/staff/payments POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
