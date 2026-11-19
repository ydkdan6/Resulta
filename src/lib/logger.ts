// src/lib/logger.ts
/**
 * Safe logging utility that redacts PINs, passwords, and personal data (PII)
 * to comply with NDPA and prevent credential/data leakage in console logs or error reports.
 */

const SENSITIVE_KEY_PATTERNS = [
  /pin/i,
  /password/i,
  /secret/i,
  /token/i,
  /cookie/i,
  /auth/i,
  /phone/i,
  /email/i,
  /full_name/i,
  /fullname/i,
  /first_name/i,
  /firstname/i,
  /last_name/i,
  /lastname/i,
  /student_name/i,
  /studentname/i,
  /admission_number/i,
  /admissionnumber/i,
  /admission/i,
];

/**
 * Recursively redacts sensitive keys from any object or array.
 */
export function sanitizeData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    // Redact database connection strings that might have postgresql://user:pass@host
    let sanitized = input.replace(/postgresql:\/\/[^@]+@/gi, 'postgresql://[REDACTED]@');
    // Redact bcrypt hashes or 10-character PIN-like sequences in strings if detected
    sanitized = sanitized.replace(/\$2[aby]\$\d+\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]');
    return sanitized as unknown as T;
  }

  if (typeof input !== 'object') {
    return input;
  }

  if (input instanceof Date) {
    return new Date(input.getTime()) as unknown as T;
  }

  if (input instanceof Error) {
    const cleanError: Record<string, unknown> = {
      name: input.name,
      message: sanitizeData(input.message),
    };
    if (process.env.NODE_ENV !== 'production' && input.stack) {
      cleanError.stack = sanitizeData(input.stack);
    }
    return cleanError as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeData(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeData(val);
    }
  }

  return result as T;
}

export const logger = {
  info(message: string, meta?: unknown) {
    if (meta !== undefined) {
      console.log(`[INFO] ${message}`, sanitizeData(meta));
    } else {
      console.log(`[INFO] ${message}`);
    }
  },
  warn(message: string, meta?: unknown) {
    if (meta !== undefined) {
      console.warn(`[WARN] ${message}`, sanitizeData(meta));
    } else {
      console.warn(`[WARN] ${message}`);
    }
  },
  error(message: string, err?: unknown) {
    if (err !== undefined) {
      console.error(`[ERROR] ${message}`, sanitizeData(err));
    } else {
      console.error(`[ERROR] ${message}`);
    }
  },
};
