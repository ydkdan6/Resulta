import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin, AuthError } from "@/lib/auth/scope";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * DELETE /api/admin/teachers/assignments/[id]
 * Removes a teacher assignment line.
 * Only platform_admin can delete teacher assignments (403 for others).
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requirePlatformAdmin(undefined, request);
    const { id } = await context.params;

    const assignment = await prisma.teacherAssignment.findUnique({
      where: { id },
    });

    if (!assignment) {
      return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
    }

    await prisma.teacherAssignment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Assignment removed." });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[DELETE /api/admin/teachers/assignments/[id]] Error:", error);
    return NextResponse.json({ error: "Failed to remove assignment." }, { status: 500 });
  }
}
