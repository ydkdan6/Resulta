// src/app/api/health/route.ts
import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/lib/prisma';
import { jobQueue } from '@/modules/jobs/jobQueue';
import { cacheService } from '@/modules/cache/cacheService';

/**
 * GET /api/health
 * Public health check and readiness probe.
 * Checks database connectivity, background job queue state, and memory health.
 */
export async function GET() {
  const startTime = performance.now();
  const dbHealth = await checkDatabaseHealth(3000);
  const queueMetrics = jobQueue.getMetrics();
  const cacheSize = cacheService.size();

  const memUsage = process.memoryUsage();
  const memoryMb = {
    rss: Math.round(memUsage.rss / 1024 / 1024),
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
  };

  const isHealthy = dbHealth.healthy;
  const statusCode = isHealthy ? 200 : 503;

  const totalTimeMs = Math.round(performance.now() - startTime);

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      responseTimeMs: totalTimeMs,
      services: {
        database: {
          status: dbHealth.healthy ? 'connected' : 'unreachable',
          latencyMs: dbHealth.latencyMs,
          error: dbHealth.error,
        },
        jobQueue: {
          status: 'running',
          ...queueMetrics,
        },
        cache: {
          status: 'active',
          cachedItems: cacheSize,
        },
        system: {
          memoryMb,
          nodeVersion: process.version,
        },
      },
    },
    {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
