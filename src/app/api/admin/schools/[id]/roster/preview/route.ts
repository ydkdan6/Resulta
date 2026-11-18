// src/app/api/admin/schools/[id]/roster/preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/scope";
import {
  parseFileToRawRows,
  validateRosterRows,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/roster/parseAndValidate";
import {
  checkUploadRateLimit,
  recordUpload,
} from "@/modules/security/rateLimiter";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const session = await requireAuth(undefined, request);
    if (session.role !== "platform_admin") {
      throw new AuthError("Platform administrator privileges required.", 403);
    }

    const { id: schoolId } = await context.params;

    const rateKey = `${ip}:${session.id}`;
    const rateCheck = checkUploadRateLimit(rateKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.message || 'Upload limit reached. Please wait before uploading another file.' },
        { status: 429 }
      );
    }
    recordUpload(rateKey);

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        classes: { select: { id: true, name: true } },
        students: {
          select: {
            admission_number: true,
            full_name: true,
            class: { select: { name: true } },
          },
        },
      },
    });

    if (!school) {
      return NextResponse.json({ error: "School not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "A valid file is required" }, { status: 400 });
    }

    const blob = file as Blob;
    const fileName = (file as any).name || "roster.csv";
    const lowerName = fileName.toLowerCase();

    // Check extension
    if (!lowerName.endsWith(".csv") && !lowerName.endsWith(".xlsx")) {
      return NextResponse.json(
        { error: "Unsupported file type. Only .csv and .xlsx files are accepted." },
        { status: 400 },
      );
    }

    if (blob.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File exceeds maximum allowed size of 5 MB.` },
        { status: 400 },
      );
    }

    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse raw rows
    const { rows: rawRows, warnings: parseWarnings } = await parseFileToRawRows(
      fileName,
      buffer,
    );

    // Map existing students for comparison
    const existingStudents = school.students.map((s) => ({
      admission_number: s.admission_number,
      full_name: s.full_name,
      class_name: s.class?.name || "",
    }));

    const existingClassNames = school.classes.map((c) => c.name);

    // Validate rows
    const validationResult = validateRosterRows(
      rawRows,
      existingStudents,
      existingClassNames,
    );

    return NextResponse.json({
      ...validationResult,
      rawRows,
      warnings: [...parseWarnings, ...validationResult.warnings],
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    const message = e instanceof Error ? e.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
