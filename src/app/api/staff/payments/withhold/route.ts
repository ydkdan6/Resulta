// src/app/api/staff/payments/withhold/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { WithholdResultSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import { logger } from '@/lib/logger';

/**
 * PATCH /api/staff/payments/withhold
 * Body: { studentId: string, termId: string, withheld: boolean }
 * Toggles result_locked (withhold results) for a student in a term.
 */
export async function PATCH(request: NextRequest) {
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
    const validation = validateInput(WithholdResultSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { studentId, termId, withheld } = validation.data;

    // Verify student belongs to school
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true, school_id: true, admission_number: true },
    });
    if (!student || student.school_id !== school_id) {
      return NextResponse.json({ error: 'Student not found in your school.' }, { status: 404 });
    }

    // Verify term belongs to school
    const term = await prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, school_id: true },
    });
    if (!term || term.school_id !== school_id) {
      return NextResponse.json({ error: 'Term not found for your school.' }, { status: 404 });
    }

    // Upsert StudentTermStatus
    const updatedStatus = await prisma.studentTermStatus.upsert({
      where: {
        student_id_term_id: { student_id: studentId, term_id: termId },
      },
      update: {
        result_locked: withheld,
      },
      create: {
        school_id,
        student_id: studentId,
        term_id: termId,
        result_locked: withheld,
        fees_paid: false,
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        school_id,
        user_id: session.id,
        action: withheld ? 'LOCK_RESULT' : 'UNLOCK_RESULT',
        entity: 'StudentTermStatus',
        entity_id: studentId,
        new_values: {
          student_id: studentId,
          term_id: termId,
          result_locked: withheld,
        },
      },
    });

    return NextResponse.json({
      success: true,
      student_id: studentId,
      term_id: termId,
      result_locked: updatedStatus.result_locked,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error('[api/staff/payments/withhold PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
