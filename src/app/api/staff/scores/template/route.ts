import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, verifyTeacherAssignment, AuthError } from "@/lib/auth/scope";
import { DEFAULT_FALLBACK_SCHEME } from "@/lib/scores/validateScores";
import { logger } from "@/lib/logger";
import {
  checkUploadRateLimit,
  recordUpload,
} from "@/modules/security/rateLimiter";

function escapeCsvCell(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);

    if (!session.school_id) {
      return NextResponse.json(
        { error: "User is not associated with any school." },
        { status: 400 }
      );
    }

    // Rate limit: treat template downloads like file uploads (10 per 5 minutes per IP)
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    const rateLimitResult = checkUploadRateLimit(`${ip}:template`);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: rateLimitResult.message || `Too many template downloads. Please wait before trying again.`,
        },
        { status: 429 }
      );
    }
    recordUpload(`${ip}:template`);

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const subjectId = searchParams.get("subjectId");

    if (!classId || !subjectId) {
      return NextResponse.json(
        { error: "classId and subjectId are required." },
        { status: 400 }
      );
    }

    const classObj = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { status: "ACTIVE" },
          select: { admission_number: true, full_name: true },
          orderBy: { admission_number: "asc" },
        },
      },
    });

    if (!classObj || classObj.school_id !== session.school_id) {
      return NextResponse.json({ error: "Class not found." }, { status: 404 });
    }

    const subjectObj = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, school_id: true },
    });

    if (!subjectObj || subjectObj.school_id !== session.school_id) {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }

    if (session.role === "teacher") {
      await verifyTeacherAssignment(session.id, session.school_id, classId, subjectId);
    }

    // Resolve grading scheme parts
    const schemes = await prisma.gradingScheme.findMany({
      where: { school_id: session.school_id },
      orderBy: { created_at: "desc" },
    });

    const matchedScheme =
      schemes.find((s) => s.class_level && classObj.name.includes(s.class_level)) ||
      schemes.find((s) => !s.class_level) ||
      schemes[0];

    const parts: Array<{ name: string; max: number }> = matchedScheme
      ? (matchedScheme.parts as any)
      : DEFAULT_FALLBACK_SCHEME.parts;

    // Build CSV
    const headers = ["admission_number", "student_name", ...parts.map((p) => p.name)];
    const csvRows = [headers.join(",")];

    for (const student of classObj.students) {
      const row = [
        escapeCsvCell(student.admission_number),
        escapeCsvCell(student.full_name),
        ...parts.map(() => ""),
      ];
      csvRows.push(row.join(","));
    }

    const csvContent = csvRows.join("\r\n");
    const sanitizedFilename = `scores-template-${classObj.name.replace(/[^a-zA-Z0-9_-]/g, "_")}-${subjectObj.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${sanitizedFilename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[api/staff/scores/template] Error:", error);
    return NextResponse.json({ error: "Failed to generate CSV template." }, { status: 500 });
  }
}
