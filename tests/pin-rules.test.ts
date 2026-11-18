import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma.ts';
import {
  generateRandomPin,
  generateSecurePin,
  hashPin,
  verifyPin,
  SAFE_PIN_CHARS,
} from '../src/lib/auth/pin.ts';
import { POST as parentLogin } from '../src/app/api/parent/login/route.ts';
import { GET as getParentResults } from '../src/app/api/parent/results/route.ts';
import { createParentSessionToken, PARENT_SESSION_COOKIE } from '../src/lib/auth/parentSession.ts';

function createMockReq(
  url: string,
  opts: {
    token?: string;
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  const headers = new Headers();
  if (opts.token) {
    headers.set('cookie', `${PARENT_SESSION_COOKIE}=${opts.token}`);
  }
  if (opts.body) {
    headers.set('content-type', 'application/json');
  }
  if (opts.headers) {
    for (const [k, v] of Object.entries(opts.headers)) {
      headers.set(k, v);
    }
  }

  return new NextRequest(new URL(url, 'http://localhost'), {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

describe('PIN Rules & Security Invariant Tests (BRIEF.md Rule 4 & 5)', () => {
  test('1. Generated PIN is 10 chars and strictly contains no ambiguous chars (0, O, o, 1, I, l, 8, B)', () => {
    for (let i = 0; i < 50; i++) {
      const pin = generateRandomPin(10);
      assert.strictEqual(pin.length, 10);
      assert.doesNotMatch(pin, /[0Oo1Il8B]/, 'PIN must not contain look-alike characters');
      for (const char of pin) {
        assert.ok(SAFE_PIN_CHARS.includes(char), `Char "${char}" must be in safe charset`);
      }
    }
  });

  test('2. Stored hash is bcrypt and never matches plain PIN', () => {
    const plainPin = 'A3C7K9W2X4';
    const hash = hashPin(plainPin);
    assert.ok(hash.startsWith('$2'), 'Bcrypt hash must start with $2a or $2b');
    assert.notStrictEqual(hash, plainPin, 'Hash must never equal plain PIN');
    assert.strictEqual(verifyPin(plainPin, hash), true, 'Valid plain PIN verifies against hash');
    assert.strictEqual(verifyPin('WRONGPIN99', hash), false, 'Wrong PIN fails verification');
  });

  test('3. Card for student A cannot open student B', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origPin = prisma.pin.findMany;

    const pinAlice = '2345679ACD';

    (prisma.school.findUnique as any) = async () => ({
      id: 'school-1',
      name: 'Grace High',
      slug: 'grace-high',
    });

    // Bob tries to login with Alice's PIN
    (prisma.student.findFirst as any) = async ({ where }: any) => {
      if (where.admission_number === 'ADM-BOB') {
        return {
          id: 'student-bob',
          school_id: 'school-1',
          admission_number: 'ADM-BOB',
          full_name: 'Bob Williams',
          status: 'ACTIVE',
        };
      }
      return null;
    };

    // Bob only has his own PIN in DB
    (prisma.pin.findMany as any) = async ({ where }: any) => {
      if (where.student_id === 'student-bob') {
        return [
          {
            id: 'pin-bob',
            pin_hash: hashPin('DIFFERENT1'),
            max_logins: 10,
            logins_used: 0,
            status: 'ACTIVE',
            term: { id: 'term-1', session: '2026/2027', term_number: 1 },
          },
        ];
      }
      return [];
    };

    try {
      const req = createMockReq('http://localhost/api/parent/login', {
        method: 'POST',
        body: {
          schoolSlug: 'grace-high',
          admissionNumber: 'ADM-BOB',
          pin: pinAlice, // Alice's PIN used on Bob's admission number
        },
      });
      const res = await parentLogin(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'Invalid admission number or PIN.');
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.pin.findMany = origPin;
    }
  });

  test('4. Term hierarchy: PIN for Term 2 can access Term 2 and Term 1, but NEVER Term 3', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findUnique;
    const origTerms = prisma.term.findMany;
    const origStatuses = prisma.studentTermStatus.findMany;
    const origResults = prisma.result.findMany;

    (prisma.school.findUnique as any) = async () => ({
      id: 'school-1',
      name: 'Grace High',
      slug: 'grace-high',
    });

    (prisma.student.findUnique as any) = async () => ({
      id: 'student-1',
      admission_number: 'ADM-001',
      full_name: 'Alice Johnson',
      class: { id: 'c-1', name: 'JSS 1' },
    });

    // 3 terms published in this session
    (prisma.term.findMany as any) = async () => [
      { id: 'term-3', session: '2026/2027', term_number: 3, status: 'PUBLISHED' },
      { id: 'term-2', session: '2026/2027', term_number: 2, status: 'PUBLISHED' },
      { id: 'term-1', session: '2026/2027', term_number: 1, status: 'PUBLISHED' },
    ];

    (prisma.studentTermStatus.findMany as any) = async () => [];
    (prisma.result.findMany as any) = async () => [];

    try {
      // Parent logged in with Term 2 PIN
      const token = await createParentSessionToken({
        student_id: 'student-1',
        admission_number: 'ADM-001',
        full_name: 'Alice Johnson',
        school_id: 'school-1',
        school_slug: 'grace-high',
        pin_id: 'pin-term-2',
        pin_term_id: 'term-2',
        pin_session: '2026/2027',
        pin_term_number: 2, // Term 2
      });

      const req = createMockReq('http://localhost/api/parent/results', { token });
      const res = await getParentResults(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      const termNumbers = data.terms.map((t: any) => t.term_number);
      assert.ok(termNumbers.includes(2), 'Must include current term (Term 2)');
      assert.ok(termNumbers.includes(1), 'Must include earlier term (Term 1)');
      assert.strictEqual(termNumbers.includes(3), false, 'Must NEVER include future term (Term 3)');
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findUnique = origStudent;
      prisma.term.findMany = origTerms;
      prisma.studentTermStatus.findMany = origStatuses;
      prisma.result.findMany = origResults;
    }
  });

  test('5. Expired PIN returns 401', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origPin = prisma.pin.findMany;

    const pin = 'A2C4E6G8K9';
    (prisma.school.findUnique as any) = async () => ({ id: 's-1', slug: 'test-school' });
    (prisma.student.findFirst as any) = async () => ({ id: 'st-1', school_id: 's-1', admission_number: 'ADM-1' });
    (prisma.pin.findMany as any) = async () => [
      {
        id: 'p-1',
        pin_hash: hashPin(pin),
        status: 'EXPIRED',
        logins_used: 1,
        max_logins: 10,
        term: { id: 't-1', session: '2026/2027', term_number: 1 },
      },
    ];

    try {
      const req = createMockReq('http://localhost/api/parent/login', {
        method: 'POST',
        body: { schoolSlug: 'test-school', admissionNumber: 'ADM-1', pin },
      });
      const res = await parentLogin(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /expired/i);
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.pin.findMany = origPin;
    }
  });

  test('6. PIN login limit is enforced (logins_used >= max_logins returns 403)', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origPin = prisma.pin.findMany;

    const pin = 'A2C4E6G8K9';
    (prisma.school.findUnique as any) = async () => ({ id: 's-1', slug: 'test-school' });
    (prisma.student.findFirst as any) = async () => ({ id: 'st-1', school_id: 's-1', admission_number: 'ADM-1' });
    (prisma.pin.findMany as any) = async () => [
      {
        id: 'p-1',
        pin_hash: hashPin(pin),
        status: 'ACTIVE',
        logins_used: 10, // Max logins reached
        max_logins: 10,
        term: { id: 't-1', session: '2026/2027', term_number: 1 },
      },
    ];

    try {
      const req = createMockReq('http://localhost/api/parent/login', {
        method: 'POST',
        body: { schoolSlug: 'test-school', admissionNumber: 'ADM-1', pin },
      });
      const res = await parentLogin(req);
      assert.strictEqual(res.status, 403);
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.pin.findMany = origPin;
    }
  });

  test('7. Withheld result (result_locked = true) blocks result access', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origPin = prisma.pin.findMany;
    const origStatus = prisma.studentTermStatus.findUnique;

    const pin = 'A2C4E6G8K9';
    (prisma.school.findUnique as any) = async () => ({ id: 's-1', slug: 'test-school' });
    (prisma.student.findFirst as any) = async () => ({ id: 'st-1', school_id: 's-1', admission_number: 'ADM-1' });
    (prisma.pin.findMany as any) = async () => [
      {
        id: 'p-1',
        pin_hash: hashPin(pin),
        status: 'ACTIVE',
        logins_used: 2,
        max_logins: 10,
        term_id: 't-1',
        term: { id: 't-1', session: '2026/2027', term_number: 1 },
      },
    ];

    // Result is withheld
    (prisma.studentTermStatus.findUnique as any) = async () => ({
      result_locked: true,
    });

    try {
      const req = createMockReq('http://localhost/api/parent/login', {
        method: 'POST',
        body: { schoolSlug: 'test-school', admissionNumber: 'ADM-1', pin },
      });
      const res = await parentLogin(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /Result not released|withheld/i);
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.pin.findMany = origPin;
      prisma.studentTermStatus.findUnique = origStatus;
    }
  });
});
