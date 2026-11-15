// src/app/api/admin/schools/[id]/roster/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== "platform_admin") {
      throw new AuthError("Platform administrator privileges required.", 403);
    }

    const { id: schoolId } = await context.params;

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    const imports = await prisma.studentImport.findMany({
      where: { school_id: schoolId },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        file_name: true,
        new_count: true,
        updated_count: true,
        unchanged_count: true,
        error_count: true,
        total_count: true,
        created_at: true,
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ imports });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("[api/admin/roster/history]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
