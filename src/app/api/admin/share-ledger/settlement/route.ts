// src/app/api/admin/share-ledger/settlement/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, AuthError } from "@/lib/auth/scope";
import { validateInput } from "@/lib/validation/validate";
import { SettlementSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const session = await requirePlatformAdmin(undefined, request);

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(SettlementSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }

    const { schoolId, termId, amount, date, reference, note } = validation.data;

    if (amount <= 0) {
      return NextResponse.json(
        { error: "amount must be greater than zero." },
        { status: 400 }
      );
    }

    // Validate school exists
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) {
      return NextResponse.json({ error: "School not found." }, { status: 404 });
    }

    // Validate term belongs to school if provided
    if (termId) {
      const term = await prisma.term.findUnique({
        where: { id: termId },
        select: { id: true, school_id: true },
      });
      if (!term || term.school_id !== schoolId) {
        return NextResponse.json(
          { error: "Term not found or does not belong to this school." },
          { status: 404 }
        );
      }
    }

    const decimalAmount = new Prisma.Decimal(amount);

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.shareLedgerEntry.create({
        data: {
          school_id: schoolId,
          term_id: termId ?? null,
          student_id: null,
          type: "SETTLEMENT",
          amount: decimalAmount,
          marked_by_user_id: session.id,
          reference: reference ?? null,
          note: note ?? null,
        },
        select: {
          id: true,
          type: true,
          amount: true,
          created_at: true,
        },
      });

      await tx.auditLog.create({
        data: {
          school_id: schoolId,
          user_id: session.id,
          action: "SETTLEMENT_RECORDED",
          entity: "ShareLedgerEntry",
          entity_id: entry.id,
          new_values: {
            amount,
            school_id: schoolId,
            reference: reference ?? null,
          },
        },
      });

      return entry;
    });

    return NextResponse.json({
      success: true,
      entry: {
        id: result.id,
        type: result.type,
        amount: result.amount,
        created_at: result.created_at,
      },
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error("[api/admin/share-ledger/settlement POST]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
