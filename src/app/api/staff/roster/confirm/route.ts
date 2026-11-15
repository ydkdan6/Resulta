// src/app/api/staff/roster/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";

/**
 * POST /api/staff/roster/confirm
 * Marks the roster as confirmed for the school derived from session.
 * Body: { confirm: boolean } (optional, default true)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    const { role, school_id } = session;
    if (role !== "school_admin" && role !== "platform_admin") {
      throw new AuthError("School administrator privileges required.", 403);
    }
    if (!school_id) {
      throw new AuthError("School context missing.", 400);
    }
    const body = await request.json();
    const confirm = body?.confirm ?? true;
    if (!confirm) {
      return NextResponse.json({ error: "Confirmation flag required." }, { status: 400 });
    }

    const studentCount = await prisma.student.count({ where: { school_id } });

    const updated = await prisma.school.update({
      where: { id: school_id },
      data: {
        roster_confirmed_at: new Date(),
        roster_confirmed_count: studentCount,
      },
      select: { id: true, roster_confirmed_at: true, roster_confirmed_count: true },
    });

    await recordAuditLog({
      action: "ROSTER_CONFIRM",
      schoolId: school_id,
      details: { count: updated.roster_confirmed_count },
    });

    return NextResponse.json(updated);
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("[api/staff/roster/confirm POST]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
