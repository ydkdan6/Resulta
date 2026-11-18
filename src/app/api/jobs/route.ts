// src/app/api/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jobQueue } from '@/modules/jobs/jobQueue';
import { requireAuth } from '@/lib/auth/scope';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== 'platform_admin') {
      return NextResponse.json({ error: 'Platform admin privileges required' }, { status: 403 });
    }

    const metrics = jobQueue.getMetrics();
    return NextResponse.json(metrics);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get job metrics' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    const body = await request.json().catch(() => null);

    if (!body || !body.type || !body.payload) {
      return NextResponse.json({ error: 'Job type and payload are required' }, { status: 400 });
    }

    const job = jobQueue.enqueue(body.type, body.payload, {
      schoolId: session.school_id || body.schoolId,
      userId: session.id,
      maxRetries: body.maxRetries ?? 3,
    });

    return NextResponse.json(
      {
        success: true,
        jobId: job.id,
        status: job.status,
        message: 'Background job enqueued successfully',
      },
      { status: 202 }
    );
  } catch (error) {
    return NextResponse.json({ error: 'Failed to enqueue job' }, { status: 500 });
  }
}
