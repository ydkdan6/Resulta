// src/app/api/admin/share-ledger/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin, AuthError } from "@/lib/auth/scope";
import { logger } from "@/lib/logger";
import { Prisma } from "@prisma/client";

function escapeCell(value: string | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (str.match(/^[=+\-@]/)) {
    return `'${str}`;
  }
  return str;
}

function buildCsvRow(cells: (string | null | undefined)[]): string {
  return cells
    .map((c) => {
      const escaped = escapeCell(c);
      // Wrap in quotes if it contains comma, newline, or double-quote
      if (escaped.includes(",") || escaped.includes("\n") || escaped.includes('"')) {
        return `"${escaped.replace(/"/g, '""')}"`;
      }
      return escaped;
    })
    .join(",");
}

export async function GET(request: NextRequest) {
  try {
    const session = await requirePlatformAdmin(undefined, request);
    void session;

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get("schoolId") || undefined;
    const termId = searchParams.get("termId") || undefined;
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const type = searchParams.get("type") || undefined;
    const format = searchParams.get("format") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));

    const where: Prisma.ShareLedgerEntryWhereInput = {};

    if (schoolId) where.school_id = schoolId;
    if (termId) where.term_id = termId;
    if (type && ["SHARE_DUE", "REVERSAL", "SETTLEMENT"].includes(type)) {
      where.type = type as "SHARE_DUE" | "REVERSAL" | "SETTLEMENT";
    }
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate);
      if (endDate) where.created_at.lte = new Date(endDate);
    }

    const [entries, total] = await Promise.all([
      prisma.shareLedgerEntry.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          school_id: true,
          type: true,
          amount: true,
          reference: true,
          note: true,
          created_at: true,
          school: { select: { id: true, name: true } },
          student: {
            select: {
              id: true,
              admission_number: true,
              full_name: true,
              class: { select: { name: true } },
            },
          },
          term: { select: { id: true, session: true, term_number: true } },
          marked_by: { select: { id: true, name: true } },
        },
      }),
      prisma.shareLedgerEntry.count({ where }),
    ]);

    if (format === "csv") {
      const headerRow = buildCsvRow([
        "Date",
        "Time",
        "School",
        "Admission No",
        "Student Name",
        "Class",
        "Term",
        "Type",
        "Amount (NGN)",
        "Marked By",
        "Reference",
        "Note",
      ]);

      const dataRows = entries.map((entry) => {
        const dt = entry.created_at;
        const dateStr = dt.toISOString().slice(0, 10);
        const timeStr = dt.toISOString().slice(11, 19);
        const termLabel = entry.term
          ? `${entry.term.session} Term ${entry.term.term_number}`
          : "";
        return buildCsvRow([
          dateStr,
          timeStr,
          entry.school?.name ?? "",
          entry.student?.admission_number ?? "",
          entry.student?.full_name ?? "",
          entry.student?.class?.name ?? "",
          termLabel,
          entry.type,
          entry.amount.toFixed(2),
          entry.marked_by?.name ?? "",
          entry.reference ?? "",
          entry.note ?? "",
        ]);
      });

      const csv = [headerRow, ...dataRows].join("\r\n");

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="share-ledger.csv"`,
        },
      });
    }

    return NextResponse.json({
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error("[api/admin/share-ledger GET]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
