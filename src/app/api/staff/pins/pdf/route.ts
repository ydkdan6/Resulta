// src/app/api/staff/pins/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { generatePinCardsPdf, CardData } from '@/lib/cards/generatePdf';

/**
 * POST /api/staff/pins/pdf
 * Produces a print-ready PDF from plain PIN card objects returned at generation time.
 * Plain PINs are never saved to disk or DB, so this can only be generated once.
 * Body: { cards: CardData[] }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
      throw new AuthError('School administrator privileges required.', 403);
    }

    const body = await request.json();
    const { cards, filename } = body || {};

    if (!Array.isArray(cards) || cards.length === 0) {
      return NextResponse.json({ error: 'cards array cannot be empty.' }, { status: 400 });
    }

    const pdfBuffer = await generatePinCardsPdf(cards);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename || 'pin-cards.pdf'}"`,
      },
    });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error('[api/staff/pins/pdf POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
