import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const waitlistSchema = z.object({
  school_email: z.string().trim().email("Please enter a valid school email address."),
  whatsapp_number1: z
    .string()
    .trim()
    .min(7, "Please enter a valid primary WhatsApp number.")
    .max(25, "WhatsApp number is too long."),
  whatsapp_number2: z
    .string()
    .trim()
    .max(25, "WhatsApp number is too long.")
    .optional()
    .or(z.literal("")),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid request payload." }, { status: 400 });
    }

    const parsed = waitlistSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input data.";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { school_email, whatsapp_number1, whatsapp_number2 } = parsed.data;

    // Check if school_email already exists in waitlist
    const existing = await prisma.waitlistEntry.findFirst({
      where: {
        school_email: {
          equals: school_email.toLowerCase(),
          mode: "insensitive",
        },
      },
    });

    if (existing) {
      // Update with latest numbers to be helpful
      await prisma.waitlistEntry.update({
        where: { id: existing.id },
        data: {
          whatsapp_number1,
          whatsapp_number2: whatsapp_number2 && whatsapp_number2.trim() !== "" ? whatsapp_number2.trim() : null,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Your waitlist reservation has been updated! We will reach out shortly.",
        alreadyRegistered: true,
      });
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        school_email: school_email.toLowerCase(),
        whatsapp_number1,
        whatsapp_number2: whatsapp_number2 && whatsapp_number2.trim() !== "" ? whatsapp_number2.trim() : null,
      },
    });

    return NextResponse.json({
      success: true,
      message: "You're on the waitlist! We will notify you once onboarding commences.",
      entry: { id: entry.id },
    });
  } catch (err: unknown) {
    console.error("Waitlist submission error:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while saving your waitlist entry. Please try again." },
      { status: 500 }
    );
  }
}
