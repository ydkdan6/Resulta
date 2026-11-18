import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, AuthError } from "@/lib/auth/scope";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);

    if (!session.school_id) {
      return NextResponse.json(
        { error: "User is not associated with any school." },
        { status: 400 }
      );
    }

    let terms = await prisma.term.findMany({
      where: { school_id: session.school_id },
      orderBy: [{ session: "desc" }, { term_number: "asc" }],
    });

    // If no terms exist yet for this school, initialize standard 3 terms for current session
    if (terms.length === 0) {
      const currentSession = "2026/2027";
      const createdTerms = [];
      for (let termNum = 1; termNum <= 3; termNum++) {
        const term = await prisma.term.create({
          data: {
            school_id: session.school_id,
            session: currentSession,
            term_number: termNum,
            status: "DRAFT",
          },
        });
        createdTerms.push(term);
      }
      terms = createdTerms;
    }

    const formattedTerms = terms.map((t) => ({
      id: t.id,
      session: t.session,
      term_number: t.term_number,
      status: t.status,
      name: `Term ${t.term_number} (${t.session})`,
      is_open: t.status === "DRAFT",
    }));

    return NextResponse.json({ terms: formattedTerms });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[api/staff/terms] Error:", error);
    return NextResponse.json({ error: "Failed to fetch school terms." }, { status: 500 });
  }
}
