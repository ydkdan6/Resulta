// src/modules/security/rateLimiter.ts

interface AttemptRecord {
  count: number;
  lockedUntil: number | null;
  lastAttempt: number;
}

interface WindowRecord {
  timestamps: number[];
  lockedUntil: number | null;
}

// In-memory sliding windows and attempt tracking
const parentIpAttempts = new Map<string, AttemptRecord>();
const parentAdmAttempts = new Map<string, AttemptRecord>();

const staffIpAttempts = new Map<string, AttemptRecord>();
const staffUserAttempts = new Map<string, AttemptRecord>();

const uploadLimits = new Map<string, WindowRecord>();
const pdfDownloadLimits = new Map<string, WindowRecord>();
const complaintLimits = new Map<string, WindowRecord>();

// Configurations
const PARENT_MAX_FAILURES = 5;
const PARENT_LOCKOUT_MS = 15 * 60 * 1000; // 15 mins

const STAFF_MAX_FAILURES = 5;
const STAFF_LOCKOUT_MS = 15 * 60 * 1000; // 15 mins

const UPLOAD_MAX_PER_WINDOW = 10;
const UPLOAD_WINDOW_MS = 5 * 60 * 1000; // 5 mins

const PDF_MAX_PER_WINDOW = 20;
const PDF_WINDOW_MS = 60 * 1000; // 1 min

const COMPLAINT_MAX_PER_WINDOW = 3;
const COMPLAINT_WINDOW_MS = 10 * 60 * 1000; // 10 mins

/**
 * Periodically cleans up old records to avoid memory leaks
 */
function cleanupExpiredRecords() {
  const now = Date.now();
  const maxIdleTime = 2 * 60 * 60 * 1000; // 2 hours

  for (const [key, rec] of parentIpAttempts.entries()) {
    if (now - rec.lastAttempt > maxIdleTime && (!rec.lockedUntil || rec.lockedUntil < now)) {
      parentIpAttempts.delete(key);
    }
  }
  for (const [key, rec] of parentAdmAttempts.entries()) {
    if (now - rec.lastAttempt > maxIdleTime && (!rec.lockedUntil || rec.lockedUntil < now)) {
      parentAdmAttempts.delete(key);
    }
  }
  for (const [key, rec] of staffIpAttempts.entries()) {
    if (now - rec.lastAttempt > maxIdleTime && (!rec.lockedUntil || rec.lockedUntil < now)) {
      staffIpAttempts.delete(key);
    }
  }
  for (const [key, rec] of staffUserAttempts.entries()) {
    if (now - rec.lastAttempt > maxIdleTime && (!rec.lockedUntil || rec.lockedUntil < now)) {
      staffUserAttempts.delete(key);
    }
  }
}

// Run cleanup every 15 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredRecords, 15 * 60 * 1000).unref?.();
}

// -------------------------------------------------------------
// 1. PARENT LOGIN RATE LIMITING
// -------------------------------------------------------------

export function checkParentLoginRateLimit(ip: string, admissionNumber: string): {
  locked: boolean;
  remainingLockoutSeconds?: number;
  message?: string;
} {
  const now = Date.now();

  const ipRec = parentIpAttempts.get(ip);
  if (ipRec && ipRec.lockedUntil && ipRec.lockedUntil > now) {
    const remaining = Math.ceil((ipRec.lockedUntil - now) / 1000);
    return {
      locked: true,
      remainingLockoutSeconds: remaining,
      message: `Too many failed attempts. Temporary lockout in effect for ${remaining}s. Please check your card or contact school support.`,
    };
  }

  const admKey = admissionNumber.trim().toUpperCase();
  const admRec = parentAdmAttempts.get(admKey);
  if (admRec && admRec.lockedUntil && admRec.lockedUntil > now) {
    const remaining = Math.ceil((admRec.lockedUntil - now) / 1000);
    return {
      locked: true,
      remainingLockoutSeconds: remaining,
      message: `Too many failed attempts. Temporary lockout in effect for ${remaining}s. Please check your card or contact school support.`,
    };
  }

  return { locked: false };
}

export function recordParentLoginFailure(ip: string, admissionNumber: string) {
  const now = Date.now();

  const ipRec = parentIpAttempts.get(ip) || { count: 0, lockedUntil: null, lastAttempt: now };
  ipRec.count += 1;
  ipRec.lastAttempt = now;
  if (ipRec.count >= PARENT_MAX_FAILURES) {
    ipRec.lockedUntil = now + PARENT_LOCKOUT_MS;
  }
  parentIpAttempts.set(ip, ipRec);

  const admKey = admissionNumber.trim().toUpperCase();
  const admRec = parentAdmAttempts.get(admKey) || { count: 0, lockedUntil: null, lastAttempt: now };
  admRec.count += 1;
  admRec.lastAttempt = now;
  if (admRec.count >= PARENT_MAX_FAILURES) {
    admRec.lockedUntil = now + PARENT_LOCKOUT_MS;
  }
  parentAdmAttempts.set(admKey, admRec);
}

export function resetParentLoginAttempts(ip: string, admissionNumber: string) {
  parentIpAttempts.delete(ip);
  parentAdmAttempts.delete(admissionNumber.trim().toUpperCase());
}

// -------------------------------------------------------------
// 2. STAFF LOGIN RATE LIMITING
// -------------------------------------------------------------

export function checkStaffLoginRateLimit(ip: string, emailOrPhone: string): {
  locked: boolean;
  remainingLockoutSeconds?: number;
  message?: string;
} {
  const now = Date.now();

  const ipRec = staffIpAttempts.get(ip);
  if (ipRec && ipRec.lockedUntil && ipRec.lockedUntil > now) {
    const remaining = Math.ceil((ipRec.lockedUntil - now) / 1000);
    const minutes = Math.ceil(remaining / 60);
    return {
      locked: true,
      remainingLockoutSeconds: remaining,
      message: `Too many failed staff login attempts. For security reasons, this IP is temporarily locked for ${minutes} minute(s). Please try again later.`,
    };
  }

  const userKey = emailOrPhone.trim().toLowerCase();
  const userRec = staffUserAttempts.get(userKey);
  if (userRec && userRec.lockedUntil && userRec.lockedUntil > now) {
    const remaining = Math.ceil((userRec.lockedUntil - now) / 1000);
    const minutes = Math.ceil(remaining / 60);
    return {
      locked: true,
      remainingLockoutSeconds: remaining,
      message: `Too many failed staff login attempts. For security reasons, this account is temporarily locked for ${minutes} minute(s). Please contact school administration or try again later.`,
    };
  }

  return { locked: false };
}

export function recordStaffLoginFailure(ip: string, emailOrPhone: string) {
  const now = Date.now();

  const ipRec = staffIpAttempts.get(ip) || { count: 0, lockedUntil: null, lastAttempt: now };
  ipRec.count += 1;
  ipRec.lastAttempt = now;
  if (ipRec.count >= STAFF_MAX_FAILURES) {
    ipRec.lockedUntil = now + STAFF_LOCKOUT_MS;
  }
  staffIpAttempts.set(ip, ipRec);

  const userKey = emailOrPhone.trim().toLowerCase();
  const userRec = staffUserAttempts.get(userKey) || { count: 0, lockedUntil: null, lastAttempt: now };
  userRec.count += 1;
  userRec.lastAttempt = now;
  if (userRec.count >= STAFF_MAX_FAILURES) {
    userRec.lockedUntil = now + STAFF_LOCKOUT_MS;
  }
  staffUserAttempts.set(userKey, userRec);
}

export function resetStaffLoginAttempts(ip: string, emailOrPhone: string) {
  staffIpAttempts.delete(ip);
  staffUserAttempts.delete(emailOrPhone.trim().toLowerCase());
}

// -------------------------------------------------------------
// 3. FILE UPLOADS RATE LIMITING (CSV/Excel rosters & scoresheets)
// -------------------------------------------------------------

export function checkUploadRateLimit(identifier: string): {
  allowed: boolean;
  remainingSeconds?: number;
  message?: string;
} {
  const now = Date.now();
  const rec = uploadLimits.get(identifier);
  if (!rec) return { allowed: true };

  if (rec.lockedUntil && rec.lockedUntil > now) {
    const remaining = Math.ceil((rec.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingSeconds: remaining,
      message: `File upload limit reached. Please wait ${remaining}s before uploading another file.`,
    };
  }

  // Filter timestamps within sliding window
  const activeTimestamps = rec.timestamps.filter((t) => now - t < UPLOAD_WINDOW_MS);
  if (activeTimestamps.length >= UPLOAD_MAX_PER_WINDOW) {
    const oldest = activeTimestamps[0];
    const waitMs = UPLOAD_WINDOW_MS - (now - oldest);
    const remaining = Math.ceil(waitMs / 1000);
    rec.lockedUntil = now + waitMs;
    uploadLimits.set(identifier, rec);
    return {
      allowed: false,
      remainingSeconds: remaining,
      message: `File upload limit reached. Please wait ${remaining}s before uploading another file.`,
    };
  }

  return { allowed: true };
}

export function recordUpload(identifier: string) {
  const now = Date.now();
  const rec = uploadLimits.get(identifier) || { timestamps: [], lockedUntil: null };
  rec.timestamps = rec.timestamps.filter((t) => now - t < UPLOAD_WINDOW_MS);
  rec.timestamps.push(now);
  uploadLimits.set(identifier, rec);
}

// -------------------------------------------------------------
// 4. PDF DOWNLOADS RATE LIMITING (Reports & PIN cards)
// -------------------------------------------------------------

export function checkPdfDownloadRateLimit(identifier: string): {
  allowed: boolean;
  remainingSeconds?: number;
  message?: string;
} {
  const now = Date.now();
  const rec = pdfDownloadLimits.get(identifier);
  if (!rec) return { allowed: true };

  if (rec.lockedUntil && rec.lockedUntil > now) {
    const remaining = Math.ceil((rec.lockedUntil - now) / 1000);
    return {
      allowed: false,
      remainingSeconds: remaining,
      message: `PDF download limit reached. Please wait ${remaining}s before requesting another PDF.`,
    };
  }

  const activeTimestamps = rec.timestamps.filter((t) => now - t < PDF_WINDOW_MS);
  if (activeTimestamps.length >= PDF_MAX_PER_WINDOW) {
    const oldest = activeTimestamps[0];
    const waitMs = PDF_WINDOW_MS - (now - oldest);
    const remaining = Math.ceil(waitMs / 1000);
    rec.lockedUntil = now + waitMs;
    pdfDownloadLimits.set(identifier, rec);
    return {
      allowed: false,
      remainingSeconds: remaining,
      message: `PDF download limit reached. Please wait ${remaining}s before requesting another PDF.`,
    };
  }

  return { allowed: true };
}

export function recordPdfDownload(identifier: string) {
  const now = Date.now();
  const rec = pdfDownloadLimits.get(identifier) || { timestamps: [], lockedUntil: null };
  rec.timestamps = rec.timestamps.filter((t) => now - t < PDF_WINDOW_MS);
  rec.timestamps.push(now);
  pdfDownloadLimits.set(identifier, rec);
}

// -------------------------------------------------------------
// 5. COMPLAINT SUBMISSIONS RATE LIMITING
// -------------------------------------------------------------

export function checkComplaintRateLimit(identifier: string): {
  allowed: boolean;
  remainingSeconds?: number;
  message?: string;
} {
  const now = Date.now();
  const rec = complaintLimits.get(identifier);
  if (!rec) return { allowed: true };

  if (rec.lockedUntil && rec.lockedUntil > now) {
    const remaining = Math.ceil((rec.lockedUntil - now) / 1000);
    const minutes = Math.ceil(remaining / 60);
    return {
      allowed: false,
      remainingSeconds: remaining,
      message: `You have submitted multiple reports recently. Please wait ${minutes} minute(s) before submitting another complaint.`,
    };
  }

  const activeTimestamps = rec.timestamps.filter((t) => now - t < COMPLAINT_WINDOW_MS);
  if (activeTimestamps.length >= COMPLAINT_MAX_PER_WINDOW) {
    const oldest = activeTimestamps[0];
    const waitMs = COMPLAINT_WINDOW_MS - (now - oldest);
    const remaining = Math.ceil(waitMs / 1000);
    rec.lockedUntil = now + waitMs;
    complaintLimits.set(identifier, rec);
    return {
      allowed: false,
      remainingSeconds: remaining,
      message: `You have submitted multiple reports recently. Please wait ${Math.ceil(remaining / 60)} minute(s) before submitting another complaint.`,
    };
  }

  return { allowed: true };
}

export function recordComplaintSubmission(identifier: string) {
  const now = Date.now();
  const rec = complaintLimits.get(identifier) || { timestamps: [], lockedUntil: null };
  rec.timestamps = rec.timestamps.filter((t) => now - t < COMPLAINT_WINDOW_MS);
  rec.timestamps.push(now);
  complaintLimits.set(identifier, rec);
}

/**
 * Reset all rate limits (useful for test isolation)
 */
export function resetAllRateLimits() {
  parentIpAttempts.clear();
  parentAdmAttempts.clear();
  staffIpAttempts.clear();
  staffUserAttempts.clear();
  uploadLimits.clear();
  pdfDownloadLimits.clear();
  complaintLimits.clear();
}
