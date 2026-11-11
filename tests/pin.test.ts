import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { generateSecurePin, hashPin, verifyPin } from '../src/lib/auth/pin.ts';

describe('Cryptographic PIN Security Tests (BRIEF.md Rule 5)', () => {
  test('generateSecurePin produces random numeric strings with correct digit length', () => {
    const pin = generateSecurePin(6);
    assert.strictEqual(pin.length, 6);
    assert.match(pin, /^\d{6}$/);

    const pin8 = generateSecurePin(8);
    assert.strictEqual(pin8.length, 8);
    assert.match(pin8, /^\d{8}$/);
  });

  test('hashPin produces deterministic 64-character hex HMAC-SHA-256 hash', () => {
    const pin = '482910';
    const hash1 = hashPin(pin);
    const hash2 = hashPin(pin);

    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(hash1, hash2);
    assert.notStrictEqual(hash1, pin, 'Hash must never match plain PIN');
  });

  test('verifyPin validates valid PIN and rejects incorrect PIN', () => {
    const pin = '592813';
    const hash = hashPin(pin);

    assert.strictEqual(verifyPin(pin, hash), true, 'Valid PIN must verify');
    assert.strictEqual(verifyPin('000000', hash), false, 'Wrong PIN must fail');
    assert.strictEqual(verifyPin('59281', hash), false, 'Different length PIN must fail');
  });
});
