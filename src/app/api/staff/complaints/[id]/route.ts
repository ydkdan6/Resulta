// src/app/api/staff/complaints/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';

/**
 * PATCH /api/staff/complaints/[id]
 * Updates complaint status (RESOLVED | DISMISSED).
 * In Next.js 16, route params is a Promise<{ id: string }>.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
      throw new AuthError('School administrator privileges required.', 403);
    }
    const school_id = session.school_id;
    if (!school_id) {
      throw new AuthError('School context missing.', 400);
    }

    const { id } = await context.params;
    const body = await request.json();
    const { status } = body || {};

    if (!status || !['RESOLVED', 'DISMISSED', 'PENDING'].includes(status)) {
      return NextResponse.json(
        { error: 'Valid status (RESOLVED, DISMISSED, PENDING) is required.' },
        { status: 400 }
      );
    }

    // Verify complaint belongs to school
    const complaint = await prisma.complaint.findUnique({
      where: { id },
      select: { id: true, school_id: true },
    });
    if (!complaint || complaint.school_id !== school_id) {
      return NextResponse.json({ error: 'Complaint not found.' }, { status: 404 });
    }

    const updated = await prisma.complaint.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ success: true, complaint: updated });
  } catch (e: unknown) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error('[api/staff/complaints/[id] PATCH]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
