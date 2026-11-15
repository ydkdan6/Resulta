// src/app/api/admin/grading-scheme/route.ts
// Platform admin only: list, create, and update grading schemes.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, requirePlatformAdmin, AuthError } from "@/lib/auth/scope";
import {
  GradingSchemeSchema,
  UpdateGradingSchemeSchema,
} from "@/lib/validation/gradingScheme";

function handleError(e: unknown) {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.statusCode });
  }
  console.error("[api/admin/grading-scheme]", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

// GET /api/admin/grading-scheme?schoolId=<uuid>
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== "platform_admin") {
      throw new AuthError("Platform administrator privileges required.", 403);
    }
    const schoolId = request.nextUrl.searchParams.get("schoolId");
    if (!schoolId) {
      return NextResponse.json(
        { error: "schoolId query parameter is required" },
        { status: 400 },
      );
    }
    const schemes = await prisma.gradingScheme.findMany({
      where: { school_id: schoolId },
      orderBy: { created_at: "desc" },
    });
    return NextResponse.json(schemes);
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/admin/grading-scheme
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== "platform_admin") {
      throw new AuthError("Platform administrator privileges required.", 403);
    }
    const body = await request.json();
    const parsed = GradingSchemeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 },
      );
    }
    const { school_id, name, class_level, parts, boundaries } = parsed.data;

    // Verify the school exists
    const school = await prisma.school.findUnique({ where: { id: school_id } });
    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    const scheme = await prisma.gradingScheme.create({
      data: {
        school_id,
        name,
        class_level: class_level ?? null,
        parts: parts as object[],
        boundaries: boundaries as object[],
      },
    });
    return NextResponse.json(scheme, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

// PUT /api/admin/grading-scheme?id=<uuid>
export async function PUT(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== "platform_admin") {
      throw new AuthError("Platform administrator privileges required.", 403);
    }
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "id query parameter is required" },
        { status: 400 },
      );
    }
    const body = await request.json();
    const parsed = UpdateGradingSchemeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 422 },
      );
    }
    const { name, class_level, parts, boundaries } = parsed.data;

    // Confirm the scheme exists
    const existing = await prisma.gradingScheme.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Grading scheme not found" },
        { status: 404 },
      );
    }

    const updated = await prisma.gradingScheme.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(class_level !== undefined && { class_level }),
        ...(parts !== undefined && { parts: parts as object[] }),
        ...(boundaries !== undefined && { boundaries: boundaries as object[] }),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return handleError(e);
  }
}
