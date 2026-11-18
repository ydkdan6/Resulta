// src/app/api/staff/pins/pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { generatePinCardsPdf, CardData } from '@/lib/cards/generatePdf';
import { logger } from '@/lib/logger';
import { PinPdfSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import {
  checkPdfDownloadRateLimit,
  recordPdfDownload,
} from '@/modules/security/rateLimiter';

/**
 * POST /api/staff/pins/pdf
 * Produces a print-ready PDF from plain PIN card objects returned at generation time.
 * Plain PINs are never saved to disk or DB, so this can only be generated once.
 * Body: { cards: CardData[] }
 */
export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const session = await requireAuth(undefined, request);
    if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
      throw new AuthError('School administrator privileges required.', 403);
    }

    const rateKey = `${ip}:${session.id}`;
    const rateCheck = checkPdfDownloadRateLimit(rateKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.message || 'PDF download limit reached. Please wait before generating another PDF.' },
        { status: 429 }
      );
    }
    recordPdfDownload(rateKey);

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(PinPdfSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { cards, filename } = validation.data;

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
    logger.error('[api/staff/pins/pdf POST]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
