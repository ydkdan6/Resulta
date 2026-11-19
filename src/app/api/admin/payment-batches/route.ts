// src/app/api/admin/payment-batches/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin, AuthError } from '@/lib/auth/scope';
import { logger } from '@/lib/logger';

/**
 * GET /api/admin/payment-batches?schoolId=
 * Lists payment batches across schools or for a specific school.
 * platform_admin only.
 */
export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(undefined, request);

    const url = new URL(request.url);
    const schoolId = url.searchParams.get('schoolId');

    const where: Record<string, unknown> = {};
    if (schoolId) {
      where.school_id = schoolId;
    }

    const batches = await prisma.paymentBatch.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: {
        school: {
          select: { id: true, name: true, slug: true, platform_share: true },
        },
        term: {
          select: { id: true, session: true, term_number: true },
        },
        confirmer: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return NextResponse.json(
      { batches },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    logger.error('[api/admin/payment-batches GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
