import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  checkRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from '../src/lib/auth/parentRateLimit.ts';
import { POST as parentLogin } from '../src/app/api/parent/login/route.ts';
import { prisma } from '../src/lib/prisma.ts';

function createMockReq(
  url: string,
  opts: {
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  const headers = new Headers();
  if (opts.body) {
    headers.set('content-type', 'application/json');
  }
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      headers.set(k, v);
    }
  }

  return new NextRequest(new URL(url, 'http://localhost'), {
    method: 'POST',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

describe('Rate Limiting & Anti-Brute-Force Security Tests', () => {
  const testIp = '192.168.1.100';
  const testAdm = 'ADM-RATELIMIT-01';

  beforeEach(() => {
    resetAttempts(testIp, testAdm);
    resetAttempts('10.0.0.1', 'ADM-DIFF');
  });

  test('1. Initial check returns locked = false', () => {
    const status = checkRateLimit(testIp, testAdm);
    assert.strictEqual(status.locked, false);
  });

  test('2. Fewer than 5 failed attempts do not trigger lockout', () => {
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt(testIp, testAdm);
      const status = checkRateLimit(testIp, testAdm);
      assert.strictEqual(status.locked, false, `Attempt ${i + 1} should not lock`);
    }
  });

  test('3. Reaching 5 failed attempts triggers lockout with remaining seconds', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(testIp, testAdm);
    }
    const status = checkRateLimit(testIp, testAdm);
    assert.strictEqual(status.locked, true);
    assert.ok((status.remainingLockoutSeconds ?? 0) > 0, 'Lockout seconds must be positive');
    assert.ok((status.remainingLockoutSeconds ?? 0) <= 900, 'Lockout seconds must be <= 15 minutes');
  });

  test('4. Rate limit locks by admission number even from different IPs', () => {
    const targetStudent = 'ADM-LOCKED-STUDENT';
    // 5 attempts from 5 different IPs
    for (let i = 1; i <= 5; i++) {
      recordFailedAttempt(`172.16.0.${i}`, targetStudent);
    }

    // Now try from yet another new IP
    const check = checkRateLimit('172.16.0.99', targetStudent);
    assert.strictEqual(check.locked, true, 'Lockout must apply to target admission number');
  });

  test('5. resetAttempts clears lockout on successful login', () => {
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(testIp, testAdm);
    }
    assert.strictEqual(checkRateLimit(testIp, testAdm).locked, true);

    resetAttempts(testIp, testAdm);
    assert.strictEqual(checkRateLimit(testIp, testAdm).locked, false);
  });

  test('6. POST /api/parent/login returns 429 when rate limit is exceeded', async () => {
    const ip = '198.51.100.5';
    const adm = 'ADM-BLOCKED';
    resetAttempts(ip, adm);

    // Pre-lock
    for (let i = 0; i < 5; i++) {
      recordFailedAttempt(ip, adm);
    }

    const req = createMockReq('http://localhost/api/parent/login', {
      headers: { 'x-forwarded-for': ip },
      body: {
        schoolSlug: 'test-school',
        admissionNumber: adm,
        pin: 'ANYPIN1234',
      },
    });

    const res = await parentLogin(req);
    assert.strictEqual(res.status, 429);
    const data = await res.json();
    assert.match(data.error, /Too many failed attempts/i);
  });
});
