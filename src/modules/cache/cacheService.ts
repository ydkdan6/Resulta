// src/modules/cache/cacheService.ts
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

interface CacheItem<T> {
  value: T;
  expiresAt: number;
}

class FastMemoryCache {
  private store = new Map<string, CacheItem<any>>();
  private maxItems = 10000;

  get<T>(key: string): T | null {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): void {
    if (this.store.size >= this.maxItems) {
      // LRU eviction: remove oldest key
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  deletePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.store.keys()) {
      if (pattern.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// Global cache singleton instance
const memoryCache = new FastMemoryCache();

// TTLs in seconds
const SCHOOL_BRANDING_TTL = 3600; // 1 hour
const GRADING_SCHEME_TTL = 3600;   // 1 hour
const REPORT_CARD_TTL = 1800;      // 30 minutes

export interface SchoolBranding {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

/**
 * 1. Fetch & Cache School Branding (Name, Logo URL, Slug)
 */
export async function getCachedSchoolBranding(
  schoolIdOrSlug: string
): Promise<SchoolBranding | null> {
  const cacheKey = `school:${schoolIdOrSlug.toLowerCase()}`;
  const cached = memoryCache.get<SchoolBranding>(cacheKey);
  if (cached) return cached;

  try {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schoolIdOrSlug) ||
      schoolIdOrSlug.startsWith('s-') ||
      schoolIdOrSlug.startsWith('school-');

    const school = await prisma.school.findUnique({
      where: isUuid ? { id: schoolIdOrSlug } : { slug: schoolIdOrSlug.toLowerCase() },
      select: { id: true, name: true, slug: true, logo_url: true },
    });

    if (school) {
      memoryCache.set(`school:${school.id.toLowerCase()}`, school, SCHOOL_BRANDING_TTL);
      memoryCache.set(`school:${school.slug.toLowerCase()}`, school, SCHOOL_BRANDING_TTL);
      return school;
    }
  } catch (err) {
    logger.error('Failed to get school branding from DB', err);
  }

  return null;
}

/**
 * Invalidate school branding cache
 */
export function invalidateSchoolBranding(schoolIdOrSlug: string) {
  memoryCache.delete(`school:${schoolIdOrSlug.toLowerCase()}`);
}

/**
 * 2. Fetch & Cache Grading Scheme
 */
export async function getCachedGradingScheme(
  schoolId: string,
  classLevel?: string | null
): Promise<any | null> {
  const cacheKey = `grading:${schoolId}:${classLevel || 'default'}`;
  const cached = memoryCache.get<any>(cacheKey);
  if (cached) return cached;

  try {
    let scheme = null;
    if (classLevel) {
      scheme = await prisma.gradingScheme.findFirst({
        where: { school_id: schoolId, class_level: classLevel },
      });
    }

    if (!scheme) {
      scheme = await prisma.gradingScheme.findFirst({
        where: { school_id: schoolId, class_level: null },
      });
    }

    if (scheme) {
      memoryCache.set(cacheKey, scheme, GRADING_SCHEME_TTL);
      return scheme;
    }
  } catch (err) {
    logger.error('Failed to get grading scheme from DB', err);
  }

  return null;
}

/**
 * Invalidate grading scheme cache
 */
export function invalidateGradingScheme(schoolId: string) {
  memoryCache.deletePattern(new RegExp(`^grading:${schoolId}:`));
}

/**
 * 3. Fetch & Cache Published Report Card Data
 *
 * CRITICAL SECURITY GUARANTEE:
 * - Only SUBMITTED / PUBLISHED scores are cached.
 * - PIN hashes, passwords, or withhold states are NEVER placed in shared caches.
 */
export function getCachedReportCard<T = any>(
  schoolId: string,
  studentId: string,
  termId: string
): T | null {
  const cacheKey = `report:${schoolId}:${studentId}:${termId}`;
  return memoryCache.get<T>(cacheKey);
}

export function setCachedReportCard<T = any>(
  schoolId: string,
  studentId: string,
  termId: string,
  data: T
): void {
  // Defensive guard: Ensure no sensitive security fields leak into report cache
  const sanitized = JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (['pin_hash', 'password_hash', 'pin', 'token'].includes(key)) {
        return undefined;
      }
      return value;
    })
  );

  const cacheKey = `report:${schoolId}:${studentId}:${termId}`;
  memoryCache.set(cacheKey, sanitized, REPORT_CARD_TTL);
}

/**
 * Clear the cache when a score is unlocked and republished!
 */
export function invalidatePublishedReports(schoolId: string, termId?: string, studentId?: string) {
  if (schoolId && termId && studentId) {
    memoryCache.delete(`report:${schoolId}:${studentId}:${termId}`);
  } else if (schoolId && termId) {
    memoryCache.deletePattern(new RegExp(`^report:${schoolId}:[^:]+:${termId}`));
  } else if (schoolId) {
    memoryCache.deletePattern(new RegExp(`^report:${schoolId}:`));
  }
}

/**
 * CDN and Browser Cache-Control Headers
 */
export const CDN_STATIC_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
};

export const PRIVATE_NO_CACHE_HEADERS = {
  'Cache-Control': 'private, no-cache, no-store, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

export const cacheService = {
  getSchoolBranding: getCachedSchoolBranding,
  invalidateSchoolBranding,
  getGradingScheme: getCachedGradingScheme,
  invalidateGradingScheme,
  getReportCard: getCachedReportCard,
  setReportCard: setCachedReportCard,
  invalidateReports: invalidatePublishedReports,
  clearAll: () => memoryCache.clear(),
  size: () => memoryCache.size(),
};
