interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

const ipAttempts = new Map<string, AttemptRecord>();
const admAttempts = new Map<string, AttemptRecord>();

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes lockout

/**
 * Checks if an IP or admission number is locked out.
 */
export function checkRateLimit(ip: string, admissionNumber: string): { locked: boolean; remainingLockoutSeconds?: number } {
  const now = Date.now();

  const ipRec = ipAttempts.get(ip);
  if (ipRec && ipRec.lockedUntil && ipRec.lockedUntil > now) {
    return {
      locked: true,
      remainingLockoutSeconds: Math.ceil((ipRec.lockedUntil - now) / 1000),
    };
  }

  const admKey = admissionNumber.trim().toUpperCase();
  const admRec = admAttempts.get(admKey);
  if (admRec && admRec.lockedUntil && admRec.lockedUntil > now) {
    return {
      locked: true,
      remainingLockoutSeconds: Math.ceil((admRec.lockedUntil - now) / 1000),
    };
  }

  return { locked: false };
}

/**
 * Records a failed login attempt.
 */
export function recordFailedAttempt(ip: string, admissionNumber: string) {
  const now = Date.now();

  // 1. IP
  const ipRec = ipAttempts.get(ip) || { count: 0, lockedUntil: null, lastAttempt: now };
  ipRec.count += 1;
  ipRec.lastAttempt = now;
  if (ipRec.count >= MAX_FAILURES) {
    ipRec.lockedUntil = now + LOCKOUT_MS;
  }
  ipAttempts.set(ip, ipRec);

  // 2. Admission Number
  const admKey = admissionNumber.trim().toUpperCase();
  const admRec = admAttempts.get(admKey) || { count: 0, lockedUntil: null, lastAttempt: now };
  admRec.count += 1;
  admRec.lastAttempt = now;
  if (admRec.count >= MAX_FAILURES) {
    admRec.lockedUntil = now + LOCKOUT_MS;
  }
  admAttempts.set(admKey, admRec);
}

/**
 * Resets attempts on successful login.
 */
export function resetAttempts(ip: string, admissionNumber: string) {
  ipAttempts.delete(ip);
  admAttempts.delete(admissionNumber.trim().toUpperCase());
}
