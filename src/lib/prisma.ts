import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton for Next.js
 * Prevents multiple instances in development during hot module reloading
 * and manages PostgreSQL connections efficiently.
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
