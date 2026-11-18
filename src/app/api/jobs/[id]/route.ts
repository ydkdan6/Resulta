// src/app/api/jobs/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { jobQueue } from '@/modules/jobs/jobQueue';
import { requireAuth } from '@/lib/auth/scope';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const job = jobQueue.getJob(id);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const download = url.searchParams.get('download') === 'true';

    // If download requested and job has a PDF result, stream it directly
    if (download && job.status === 'COMPLETED' && job.result?.pdfBase64) {
      const buffer = Buffer.from(job.result.pdfBase64, 'base64');
      const filename = job.result.filename || `${job.type.toLowerCase()}.pdf`;
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      id: job.id,
      type: job.type,
      status: job.status,
      progress: job.progress,
      attempts: job.attempts,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      failedAt: job.failedAt,
      error: job.error,
      result: job.status === 'COMPLETED' ? job.result : undefined,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to retrieve job status' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth(undefined, request);
    const { id } = await context.params;

    const cancelled = jobQueue.cancelJob(id);
    if (!cancelled) {
      return NextResponse.json(
        { error: 'Job could not be cancelled or has already completed/failed' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, message: 'Job cancelled successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 });
  }
}
