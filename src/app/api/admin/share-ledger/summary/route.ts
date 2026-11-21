// src/app/api/admin/share-ledger/summary/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, AuthError } from "@/lib/auth/scope";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const session = await requirePlatformAdmin(undefined, request);
    void session;

    const { searchParams } = new URL(request.url);
    const schoolIdFilter = searchParams.get("schoolId") || undefined;
    const termId = searchParams.get("termId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;

    // Fetch schools
    const schools = await prisma.school.findMany({
      where: schoolIdFilter ? { id: schoolIdFilter } : undefined,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const schoolIds = schools.map((s) => s.id);

    // Build date filter for ledger entries
    const createdAtFilter: Prisma.ShareLedgerEntryWhereInput["created_at"] =
      startDate || endDate
        ? {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          }
        : undefined;

    // Aggregate ledger entries grouped by school_id and type
    const ledgerGroups = await prisma.shareLedgerEntry.groupBy({
      by: ["school_id", "type"],
      where: {
        school_id: { in: schoolIds },
        ...(termId ? { term_id: termId } : {}),
        ...(createdAtFilter ? { created_at: createdAtFilter } : {}),
      },
      _sum: { amount: true },
      _count: { id: true },
    });

    // Fetch latest StudentImport per school (for expected_share and active_student_count)
    const latestImports = await prisma.studentImport.findMany({
      where: { school_id: { in: schoolIds } },
      orderBy: { created_at: "desc" },
      distinct: ["school_id"],
      select: {
        school_id: true,
        active_student_count: true,
        expected_share: true,
      },
    });

    // Fetch pin counts per school (filtered by termId if provided)
    const pinGroups = await prisma.pin.groupBy({
      by: ["school_id"],
      where: {
        school_id: { in: schoolIds },
        status: "ACTIVE",
        ...(termId ? { term_id: termId } : {}),
      },
      _count: { id: true },
    });

    // Index maps
    type LedgerKey = `${string}:${"SHARE_DUE" | "REVERSAL" | "SETTLEMENT"}`;
    const ledgerMap = new Map<LedgerKey, { sum: Prisma.Decimal; count: number }>();
    for (const g of ledgerGroups) {
      const key: LedgerKey = `${g.school_id}:${g.type}`;
      ledgerMap.set(key, {
        sum: g._sum.amount ?? new Prisma.Decimal(0),
        count: g._count.id,
      });
    }

    const importMap = new Map<
      string,
      { active_student_count: number | null; expected_share: Prisma.Decimal | null }
    >();
    for (const imp of latestImports) {
      importMap.set(imp.school_id, imp);
    }

    const pinMap = new Map<string, number>();
    for (const pg of pinGroups) {
      pinMap.set(pg.school_id, pg._count.id);
    }

    // Build per-school summary
    const schoolsSummary = schools.map((school) => {
      const shareDue = ledgerMap.get(`${school.id}:SHARE_DUE`);
      const reversal = ledgerMap.get(`${school.id}:REVERSAL`);
      const settlement = ledgerMap.get(`${school.id}:SETTLEMENT`);

      const shareDueSum = shareDue?.sum ?? new Prisma.Decimal(0);
      const reversalSum = reversal?.sum ?? new Prisma.Decimal(0);
      const settlementSum = settlement?.sum ?? new Prisma.Decimal(0);

      const earned_share = shareDueSum.sub(reversalSum).toNumber();
      const received = settlementSum.toNumber();
      const outstanding = earned_share - received;
      const students_paid =
        (shareDue?.count ?? 0) - (reversal?.count ?? 0);

      const imp = importMap.get(school.id);
      const active_students = imp?.active_student_count ?? null;
      const expected_share = imp?.expected_share?.toNumber() ?? null;

      const pins_generated = pinMap.get(school.id) ?? 0;

      return {
        school_id: school.id,
        school_name: school.name,
        active_students,
        expected_share,
        students_paid,
        earned_share,
        received,
        outstanding,
        pins_generated,
      };
    });

    // Global totals
    const globalExpectedShare = schoolsSummary.reduce(
      (acc, s) => acc + (s.expected_share ?? 0),
      0
    );
    const globalEarnedShare = schoolsSummary.reduce((acc, s) => acc + s.earned_share, 0);
    const globalReceived = schoolsSummary.reduce((acc, s) => acc + s.received, 0);
    const globalOutstanding = globalEarnedShare - globalReceived;

    // Time-series data for trend and cumulative charts
    const timeEntries = await prisma.shareLedgerEntry.findMany({
      where: {
        school_id: { in: schoolIds },
        ...(termId ? { term_id: termId } : {}),
        ...(createdAtFilter ? { created_at: createdAtFilter } : {}),
      },
      select: {
        created_at: true,
        type: true,
        amount: true,
      },
      orderBy: { created_at: "asc" },
    });

    const dayMap = new Map<string, { earned: number; received: number }>();
    for (const te of timeEntries) {
      const dayKey = te.created_at.toISOString().slice(0, 10);
      const curr = dayMap.get(dayKey) || { earned: 0, received: 0 };
      const amt = Number(te.amount);
      if (te.type === "SHARE_DUE") {
        curr.earned += amt;
      } else if (te.type === "REVERSAL") {
        curr.earned -= amt;
      } else if (te.type === "SETTLEMENT") {
        curr.received += amt;
      }
      dayMap.set(dayKey, curr);
    }

    const sortedDays = Array.from(dayMap.keys()).sort();
    let runningEarned = 0;
    let runningReceived = 0;
    const timeSeries = sortedDays.map((date) => {
      const d = dayMap.get(date)!;
      runningEarned += d.earned;
      runningReceived += d.received;
      return {
        date,
        earned: d.earned,
        received: d.received,
        cumulativeEarned: runningEarned,
        cumulativeReceived: runningReceived,
      };
    });

    return NextResponse.json({
      schools: schoolsSummary,
      global: {
        expected_share: globalExpectedShare,
        earned_share: globalEarnedShare,
        received: globalReceived,
        outstanding: globalOutstanding,
      },
      timeSeries,
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error("[api/admin/share-ledger/summary GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
