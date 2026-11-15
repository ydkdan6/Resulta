import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

// Characters without look-alikes:
// Excludes 0, O, o, 1, I, l, 8, B
export const SAFE_PIN_CHARS = '2345679ACDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates a random 10-character PIN per student with no look-alike characters.
 */
export function generateRandomPin(length = 10): string {
  let result = '';
  const charLength = SAFE_PIN_CHARS.length;
  // Use crypto.randomInt for cryptographic randomness
  for (let i = 0; i < length; i++) {
    result += SAFE_PIN_CHARS[crypto.randomInt(0, charLength)];
  }
  return result;
}

/**
 * Backward compatibility: generate numeric pin if needed
 */
export function generateSecurePin(digits = 6): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return crypto.randomInt(min, max + 1).toString();
}

/**
 * Hash a PIN using bcrypt.
 * Never stores plain PINs or reversible hashes.
 */
export function hashPin(plainPin: string): string {
  const salt = bcrypt.genSaltSync(10);
  return bcrypt.hashSync(plainPin.trim().toUpperCase(), salt);
}

/**
 * Verify a plain PIN against a stored hash using bcrypt.
 */
export function verifyPin(plainPin: string, storedHash: string): boolean {
  if (!plainPin || !storedHash) return false;
  return bcrypt.compareSync(plainPin.trim().toUpperCase(), storedHash);
}
