// src/app/api/staff/payments/unmark/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { UnmarkPaymentsSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import { logger } from '@/lib/logger';

/**
 * PATCH /api/staff/payments/unmark
 * Marks students as unpaid (fees_paid = false) and creates a REVERSAL ledger entry.
 *
 * Rules:
 * - school_admin is refused if any target student has an ACTIVE PIN for the term.
 * - platform_admin may override but must supply a reason (written to audit log).
 * - Idempotency: uses updateMany(where fees_paid=true); only changed rows get a REVERSAL.
 *
 * Body: { termId: string, studentIds: string[], reason?: string }
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
    const validation = validateInput(UnmarkPaymentsSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { termId, studentIds, reason } = validation.data;

    // Verify term belongs to school
    const term = await prisma.term.findUnique({ where: { id: termId } });
    if (!term || term.school_id !== school_id) {
      return NextResponse.json({ error: 'Term not found for your school.' }, { status: 404 });
    }

    // Verify all students belong to this school
    const studentsInSchool = await prisma.student.findMany({
      where: { id: { in: studentIds }, school_id },
      select: { id: true },
    });
    if (studentsInSchool.length !== studentIds.length) {
      return NextResponse.json(
        { error: 'One or more students do not belong to this school.' },
        { status: 403 }
      );
    }

    // Check for active PINs for these students in this term
    const activePins = await prisma.pin.findMany({
      where: {
        school_id,
        student_id: { in: studentIds },
        term_id: termId,
        status: 'ACTIVE',
      },
      select: { student_id: true },
    });

    if (activePins.length > 0) {
      if (session.role === 'school_admin') {
        // School admin is blocked outright
        return NextResponse.json(
          {
            error:
              'Cannot unmark: one or more students have an active PIN for this term. Contact the platform administrator to override.',
            students_with_active_pins: activePins.map((p) => p.student_id),
          },
          { status: 409 }
        );
      }

      // Platform admin must supply a reason
      if (!reason || reason.trim().length < 5) {
        return NextResponse.json(
          {
            error:
              'A reason (minimum 5 characters) is required when unmarking a student who has an active PIN.',
          },
          { status: 422 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // Snapshot platform share at this moment
      const school = await tx.school.findUnique({
        where: { id: school_id },
        select: { platform_share: true },
      });
      const platformShare = school?.platform_share ?? 1000;

      let newlyUnmarkedCount = 0;

      for (const studentId of studentIds) {
        // Atomically flip fees_paid only if currently true
        const updated = await tx.studentTermStatus.updateMany({
          where: {
            student_id: studentId,
            term_id: termId,
            fees_paid: true,
          },
          data: { fees_paid: false },
        });

        // Create REVERSAL only when the row was actually changed
        if (updated.count > 0) {
          await tx.shareLedgerEntry.create({
            data: {
              school_id,
              student_id: studentId,
              term_id: termId,
              type: 'REVERSAL',
              amount: platformShare,
              marked_by_user_id: session.id,
              note: reason?.trim() || null,
            },
          });
          newlyUnmarkedCount++;
        }
      }

      // Audit log — reason written here when active PINs were involved
      await tx.auditLog.create({
        data: {
          school_id,
          user_id: session.id,
          action: 'UNMARK_STUDENTS_PAID',
          entity: 'StudentTermStatus',
          entity_id: termId,
          new_values: {
            count: studentIds.length,
            newly_unmarked: newlyUnmarkedCount,
            already_unpaid: studentIds.length - newlyUnmarkedCount,
            had_active_pins: activePins.length > 0,
            reason: reason?.trim() || null,
          },
        },
      });

      return { updatedCount: studentIds.length, newlyUnmarkedCount };
    });

    return NextResponse.json({
      success: true,
      updated_count: result.updatedCount,
      newly_unmarked_count: result.newlyUnmarkedCount,
      already_unpaid_count: result.updatedCount - result.newlyUnmarkedCount,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error('[api/staff/payments/unmark PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
