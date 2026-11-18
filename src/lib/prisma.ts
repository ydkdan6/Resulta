import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton for Next.js with connection pooling optimization.
 * Prevents multiple instances in development during hot module reloading
 * and manages PostgreSQL connections efficiently during high-traffic result release week.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Database health check utility for system monitoring & readiness probes.
 */
export async function checkDatabaseHealth(timeoutMs = 3000): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const healthPromise = prisma.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Database health check timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    await Promise.race([healthPromise, timeoutPromise]);
    const latencyMs = Math.round(performance.now() - start);
    return { healthy: true, latencyMs };
  } catch (err: unknown) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      healthy: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
