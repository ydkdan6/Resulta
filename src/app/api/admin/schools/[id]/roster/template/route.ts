// src/app/api/admin/schools/[id]/roster/template/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/scope";
import { getSampleRosterTemplateCsv } from "@/lib/roster/parseAndValidate";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== "platform_admin") {
      throw new AuthError("Platform administrator privileges required.", 403);
    }
    await context.params;

    const csvContent = getSampleRosterTemplateCsv();

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="roster-template.csv"',
      },
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("[api/admin/roster/template]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
