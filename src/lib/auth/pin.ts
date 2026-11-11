import crypto from 'node:crypto';

const PIN_SECRET = process.env.PIN_HMAC_SECRET || 'dev-secret-key-resulta-pin-security-token';

/**
 * Generates a cryptographically secure numeric PIN.
 * Default length is 6 digits.
 */
export function generateSecurePin(digits = 6): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return crypto.randomInt(min, max + 1).toString();
}

/**
 * Creates a keyed HMAC-SHA-256 hash of a PIN using the secret key.
 * As required by BRIEF.md Rule 5, plain PINs and unkeyed hashes are never stored.
 */
export function hashPin(plainPin: string): string {
  return crypto
    .createHmac('sha256', PIN_SECRET)
    .update(plainPin.trim())
    .digest('hex');
}

/**
 * Secure constant-time comparison of a submitted PIN against a stored hash.
 */
export function verifyPin(plainPin: string, storedHash: string): boolean {
  const computedHash = hashPin(plainPin);
  const computedBuffer = Buffer.from(computedHash, 'hex');
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (computedBuffer.length !== storedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuffer, storedBuffer);
}
