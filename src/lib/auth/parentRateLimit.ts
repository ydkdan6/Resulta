// src/lib/auth/parentRateLimit.ts
// Re-exports unified rate limiting methods with complete backwards compatibility for parent portal auth.

export {
  checkParentLoginRateLimit as checkRateLimit,
  recordParentLoginFailure as recordFailedAttempt,
  resetParentLoginAttempts as resetAttempts,
} from '@/modules/security/rateLimiter';
