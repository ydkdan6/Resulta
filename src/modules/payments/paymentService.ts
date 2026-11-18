// src/modules/payments/paymentService.ts
import { prisma } from '@/lib/prisma';
import { PaymentStatus } from '@prisma/client';

export class PaymentService {
  static async listBatches(schoolId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [batches, total] = await Promise.all([
      prisma.paymentBatch.findMany({
        where: { school_id: schoolId },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          term: { select: { session: true, term_number: true } },
          confirmer: { select: { name: true, email: true } },
        },
      }),
      prisma.paymentBatch.count({ where: { school_id: schoolId } }),
    ]);

    return {
      batches,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async confirmBatch(batchId: string, confirmerUserId: string, amountReceived?: number) {
    const batch = await prisma.paymentBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) throw new Error('Payment batch not found');

    return prisma.paymentBatch.update({
      where: { id: batchId },
      data: {
        status: 'CONFIRMED',
        confirmed_by: confirmerUserId,
        confirmed_at: new Date(),
        ...(amountReceived !== undefined ? { amount_received: amountReceived } : {}),
      },
    });
  }

  static async setStudentWithholding(schoolId: string, studentId: string, termId: string, locked: boolean) {
    return prisma.studentTermStatus.upsert({
      where: {
        student_id_term_id: {
          student_id: studentId,
          term_id: termId,
        },
      },
      create: {
        school_id: schoolId,
        student_id: studentId,
        term_id: termId,
        result_locked: locked,
        fees_paid: !locked,
      },
      update: {
        result_locked: locked,
      },
    });
  }

  static async checkConfirmedBatchExists(schoolId: string, termId: string, batchId?: string) {
    return prisma.paymentBatch.findFirst({
      where: {
        school_id: schoolId,
        term_id: termId,
        status: 'CONFIRMED',
        ...(batchId ? { id: batchId } : {}),
      },
    });
  }
}
