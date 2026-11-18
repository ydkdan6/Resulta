// src/app/api/admin/audit-logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePlatformAdmin, AuthError } from '@/lib/auth/scope';
import { sanitizeData, logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdmin(undefined, request);

    const url = new URL(request.url);
    const schoolId = url.searchParams.get('schoolId') || undefined;
    const action = url.searchParams.get('action') || undefined;
    const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100);
    const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

    const where: Record<string, unknown> = {};
    if (schoolId) where.school_id = schoolId;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { timestamp: 'desc' },
        include: {
          school: {
            select: { id: true, name: true, slug: true },
          },
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    const sanitizedLogs = logs.map((log) => sanitizeData({
      id: log.id,
      action: log.action,
      entity: log.entity,
      entity_id: log.entity_id,
      old_values: log.old_values,
      new_values: log.new_values,
      reason: log.reason,
      timestamp: log.timestamp,
      school: log.school,
      user: log.user,
    }));

    return NextResponse.json({
      auditLogs: sanitizedLogs,
      total,
      limit,
      offset,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error('Failed to retrieve platform audit logs', error);
    return NextResponse.json({ error: 'Failed to retrieve audit logs.' }, { status: 500 });
  }
}
