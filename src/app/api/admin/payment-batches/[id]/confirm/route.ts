// src/app/api/admin/payment-batches/[id]/confirm/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin, AuthError } from '@/lib/auth/scope';
import { Prisma } from '@prisma/client';

/**
 * POST /api/admin/payment-batches/[id]/confirm
 * platform_admin records a payment received for a batch and confirms it.
 * Body: { amountReceived?: number }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePlatformAdmin(undefined, request);
    const { id } = await context.params;

    let body = {};
    try {
      body = await request.json();
    } catch {
      // Body is optional
    }
    const { amountReceived } = (body as { amountReceived?: number }) || {};

    const batch = await prisma.paymentBatch.findUnique({
      where: { id },
      include: { school: true },
    });

    if (!batch) {
      return NextResponse.json({ error: 'Payment batch not found.' }, { status: 404 });
    }

    if (batch.status === 'CONFIRMED') {
      return NextResponse.json(
        { error: 'This payment batch has already been confirmed.' },
        { status: 409 }
      );
    }

    const received = amountReceived !== undefined
      ? new Prisma.Decimal(amountReceived)
      : batch.amount_due;

    const [updatedBatch] = await prisma.$transaction([
      prisma.paymentBatch.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          amount_received: received,
          confirmed_by: session.id,
          confirmed_at: new Date(),
        },
      }),
      prisma.auditLog.create({
        data: {
          school_id: batch.school_id,
          user_id: session.id,
          action: 'CONFIRM_PAYMENT_BATCH',
          entity: 'PaymentBatch',
          entity_id: id,
          new_values: {
            batch_id: id,
            amount_due: batch.amount_due.toString(),
            amount_received: received.toString(),
            status: 'CONFIRMED',
          },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      batch: updatedBatch,
      message: 'Payment batch confirmed successfully. PIN generation is now approved for students in this batch.',
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error('[api/admin/payment-batches/[id]/confirm POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
