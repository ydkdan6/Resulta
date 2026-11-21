import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "platform_admin") {
      return NextResponse.json(
        { error: "Forbidden: Platform administrator privileges required." },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q")?.trim() || "";

    const entries = await prisma.waitlistEntry.findMany({
      where: query
        ? {
            OR: [
              { school_email: { contains: query, mode: "insensitive" } },
              { whatsapp_number1: { contains: query, mode: "insensitive" } },
              { whatsapp_number2: { contains: query, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { created_at: "desc" },
    });

    return NextResponse.json({
      success: true,
      entries,
      total: entries.length,
    });
  } catch (err: unknown) {
    console.error("Error fetching waitlist:", err);
    return NextResponse.json(
      { error: "Failed to load waitlist entries." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || session.role !== "platform_admin") {
      return NextResponse.json(
        { error: "Forbidden: Platform administrator privileges required." },
        { status: 403 }
      );
    }

    const { id } = await request.json().catch(() => ({}));
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Entry ID is required." }, { status: 400 });
    }

    await prisma.waitlistEntry.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Error deleting waitlist entry:", err);
    return NextResponse.json(
      { error: "Failed to delete waitlist entry." },
      { status: 500 }
    );
  }
}
