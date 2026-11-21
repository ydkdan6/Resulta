// src/app/api/admin/share-ledger/school-summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/scope";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);

    if (
      session.role !== "school_admin" &&
      session.role !== "platform_admin"
    ) {
      throw new AuthError("School administrator privileges required.", 403);
    }

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("termId") || undefined;

    let schoolId: string;

    if (session.role === "platform_admin") {
      const qSchoolId = searchParams.get("schoolId");
      if (!qSchoolId) {
        return NextResponse.json(
          { error: "schoolId query parameter is required for platform_admin." },
          { status: 400 }
        );
      }
      schoolId = qSchoolId;
    } else {
      // school_admin: verify tenant isolation
      const qSchoolId = searchParams.get("schoolId");
      if (qSchoolId && qSchoolId !== session.school_id) {
        throw new AuthError(
          "Cross-tenant access forbidden: Cannot access data belonging to another school.",
          403
        );
      }
      if (!session.school_id) {
        return NextResponse.json(
          { error: "School context missing from session." },
          { status: 400 }
        );
      }
      schoolId = session.school_id;
    }

    // Fetch school pricing
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, card_price: true, platform_share: true },
    });
    if (!school) {
      return NextResponse.json({ error: "School not found." }, { status: 404 });
    }

    const card_price = school.card_price.toNumber();
    const platform_share = school.platform_share.toNumber();
    const school_share_per_student = card_price - platform_share;

    // Build where for ledger queries
    const ledgerWhere = {
      school_id: schoolId,
      ...(termId ? { term_id: termId } : {}),
    };

    // Aggregate SHARE_DUE and REVERSAL entries
    const [shareDueAgg, reversalAgg] = await Promise.all([
      prisma.shareLedgerEntry.aggregate({
        where: { ...ledgerWhere, type: "SHARE_DUE" },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.shareLedgerEntry.aggregate({
        where: { ...ledgerWhere, type: "REVERSAL" },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const shareDueSum = shareDueAgg._sum.amount ?? new Prisma.Decimal(0);
    const reversalSum = reversalAgg._sum.amount ?? new Prisma.Decimal(0);
    const shareDueCount = shareDueAgg._count.id;
    const reversalCount = reversalAgg._count.id;

    const students_paid = shareDueCount - reversalCount;
    const platform_amount_owed = shareDueSum.sub(reversalSum).toNumber();
    const school_total_share = students_paid * school_share_per_student;

    return NextResponse.json({
      students_paid,
      platform_amount_owed,
      school_share_per_student,
      school_total_share,
      card_price,
      platform_share,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error("[api/admin/share-ledger/school-summary GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
