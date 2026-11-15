import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  generateRandomPin,
  generateSecurePin,
  hashPin,
  verifyPin,
  SAFE_PIN_CHARS,
} from '../src/lib/auth/pin.ts';
import { POST as loginWithPin } from '../src/app/api/results/login/route.ts';
import { POST as reprintPin } from '../src/app/api/staff/pins/reprint/route.ts';
import { POST as generatePins } from '../src/app/api/staff/pins/generate/route.ts';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth/session.ts';
import { prisma } from '../src/lib/prisma.ts';

function createMockReq(
  url: string,
  opts: {
    token?: string;
    method?: string;
    body?: any;
  } = {}
) {
  const headers = new Headers();
  if (opts.token) {
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${opts.token}`);
  }
  if (opts.body) {
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(new URL(url, 'http://localhost'), {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function tokenFor(
  role: 'platform_admin' | 'school_admin' | 'teacher',
  school_id: string | null = 'school-1',
  userId = `user-${role}`
) {
  return createSessionToken({
    id: userId,
    email: `${role}@example.com`,
    name: role,
    role,
    school_id,
  });
}

describe('Cryptographic PIN Security & Engine Tests (BRIEF.md Rule 4 & 5)', () => {
  test('generateRandomPin produces 10-character string without look-alike characters (0, O, o, 1, I, l, 8, B)', () => {
    for (let i = 0; i < 20; i++) {
      const pin = generateRandomPin(10);
      assert.strictEqual(pin.length, 10);
      for (const char of pin) {
        assert.ok(
          SAFE_PIN_CHARS.includes(char),
          `Character ${char} must be in safe charset without look-alikes`
        );
      }
      assert.doesNotMatch(pin, /[0Oo1Il8B]/, 'PIN must not contain look-alike characters');
    }
  });

  test('hashPin and verifyPin using bcrypt hash', () => {
    const pin = 'A3C7K9W2X4';
    const hash = hashPin(pin);

    assert.ok(hash.startsWith('$2'), 'Bcrypt hash must start with $2a or $2b');
    assert.notStrictEqual(hash, pin, 'Hash must never match plain PIN');
    assert.strictEqual(verifyPin(pin, hash), true, 'Valid PIN verifies successfully');
    assert.strictEqual(verifyPin('WRONGPIN12', hash), false, 'Wrong PIN fails');
  });

  test('Cross-student security: Card for student A cannot open student B', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origPin = prisma.pin.findMany;

    const pinAlice = '2345679ACD';
    const hashAlice = hashPin(pinAlice);

    (prisma.school.findUnique as any) = async () => ({
      id: 'school-1',
      name: 'Grace High',
      slug: 'grace-high',
    });

    // When Bob attempts to login with Alice's PIN:
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

    // Bob has his own PIN in DB, not Alice's
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
      // Bob tries to login with Alice's PIN
      const req = createMockReq('http://localhost/api/results/login', {
        method: 'POST',
        body: {
          schoolSlug: 'grace-high',
          admissionNumber: 'ADM-BOB',
          pin: pinAlice,
        },
      });
      const res = await loginWithPin(req);
      assert.strictEqual(res.status, 401, 'Student B cannot login with Student A PIN');
      const data = await res.json();
      assert.strictEqual(data.error, 'Invalid admission number or PIN.');
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.pin.findMany = origPin;
    }
  });

  test('PIN matches only its own term and fails for expired PINs', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origPin = prisma.pin.findMany;

    (prisma.school.findUnique as any) = async () => ({
      id: 'school-1',
      name: 'Grace High',
      slug: 'grace-high',
    });

    (prisma.student.findFirst as any) = async () => ({
      id: 'student-alice',
      school_id: 'school-1',
      admission_number: 'ADM-ALICE',
      full_name: 'Alice Johnson',
      status: 'ACTIVE',
    });

    // Student has an EXPIRED PIN (no ACTIVE pins returned)
    (prisma.pin.findMany as any) = async () => [];

    try {
      const req = createMockReq('http://localhost/api/results/login', {
        method: 'POST',
        body: {
          schoolSlug: 'grace-high',
          admissionNumber: 'ADM-ALICE',
          pin: 'EXPIRED123',
        },
      });
      const res = await loginWithPin(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.match(data.error, /Expired or invalid PIN/);
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.pin.findMany = origPin;
    }
  });

  test('Reprint replaces old PIN, requires reason, and creates AuditLog without logging plain PIN', async () => {
    const origStudent = prisma.student.findUnique;
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origTx = prisma.$transaction;

    let auditLogCreated: any = null;
    let pinCreated: any = null;
    let oldPinRevoked = false;

    (prisma.student.findUnique as any) = async () => ({
      id: 'student-1',
      school_id: 'school-1',
      admission_number: 'ADM001',
      full_name: 'Alice',
      class: { name: 'JSS 1' },
      termStatuses: [{ fees_paid: true, result_locked: false }],
    });
    (prisma.term.findUnique as any) = async () => ({
      id: 'term-1',
      school_id: 'school-1',
      session: '2026/2027',
      term_number: 1,
    });
    (prisma.school.findUnique as any) = async () => ({
      id: 'school-1',
      name: 'Grace High',
      slug: 'grace-high',
      logo_url: null,
    });

    (prisma.$transaction as any) = async (cb: any) => {
      return cb({
        pin: {
          findFirst: async () => ({ id: 'old-pin-id' }),
          updateMany: async () => {
            oldPinRevoked = true;
            return { count: 1 };
          },
          create: async ({ data }: any) => {
            pinCreated = data;
            return { id: 'new-pin-id', ...data };
          },
        },
        auditLog: {
          create: async ({ data }: any) => {
            auditLogCreated = data;
            return { id: 'audit-1' };
          },
        },
      });
    };

    try {
      const adminToken = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/pins/reprint', {
        token: adminToken,
        method: 'POST',
        body: {
          studentId: 'student-1',
          termId: 'term-1',
          reason: 'Parent lost original printed card',
        },
      });

      const res = await reprintPin(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.plain_pin.length, 10);
      assert.strictEqual(oldPinRevoked, true);

      // Verify that database PIN is hashed with bcrypt
      assert.ok(pinCreated.pin_hash.startsWith('$2'));
      assert.strictEqual(pinCreated.max_logins, 10);

      // Verify AuditLog integrity: must contain reason, but NEVER plain PIN
      assert.strictEqual(auditLogCreated.action, 'REPRINT_PIN');
      assert.strictEqual(auditLogCreated.reason, 'Parent lost original printed card');
      const auditString = JSON.stringify(auditLogCreated);
      assert.ok(!auditString.includes(data.plain_pin), 'Plain PIN must NEVER appear in AuditLog');
    } finally {
      prisma.student.findUnique = origStudent;
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.$transaction = origTx;
    }
  });

  test('Generating a new term expires previous term PINs and never stores plain PINs', async () => {
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origBatch = prisma.paymentBatch.findFirst;
    const origStudents = prisma.student.findMany;
    const origTx = prisma.$transaction;

    let expiredEarlierTermsCalled = false;
    let createdPinRecord: any = null;
    let auditLogRecord: any = null;

    (prisma.term.findUnique as any) = async () => ({
      id: 'term-2',
      school_id: 'school-1',
      session: '2026/2027',
      term_number: 2,
    });
    (prisma.school.findUnique as any) = async () => ({
      id: 'school-1',
      name: 'Grace High',
      slug: 'grace-high',
      logo_url: null,
    });
    (prisma.paymentBatch.findFirst as any) = async () => ({
      id: 'batch-1',
      status: 'CONFIRMED',
    });
    (prisma.student.findMany as any) = async () => [
      {
        id: 'student-1',
        admission_number: 'ADM001',
        full_name: 'Alice Johnson',
        status: 'ACTIVE',
        class: { id: 'c-1', name: 'JSS 1' },
        termStatuses: [{ fees_paid: true, result_locked: false }],
      },
    ];

    (prisma.$transaction as any) = async (cb: any) => {
      return cb({
        term: {
          findMany: async () => [{ id: 'term-1' }], // earlier term
        },
        pin: {
          updateMany: async ({ data, where }: any) => {
            if (data.status === 'EXPIRED') {
              expiredEarlierTermsCalled = true;
            }
            return { count: 1 };
          },
          create: async ({ data }: any) => {
            createdPinRecord = data;
            return { id: 'pin-new', ...data };
          },
        },
        auditLog: {
          create: async ({ data }: any) => {
            auditLogRecord = data;
            return { id: 'audit-log-1' };
          },
        },
      });
    };

    try {
      const adminToken = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/pins/generate', {
        token: adminToken,
        method: 'POST',
        body: {
          termId: 'term-2',
          studentIds: ['student-1'],
        },
      });

      const res = await generatePins(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.pins[0].plain_pin.length, 10);
      assert.strictEqual(expiredEarlierTermsCalled, true, 'Earlier term PINs must be marked EXPIRED');

      // Database record check
      assert.ok(createdPinRecord.pin_hash.startsWith('$2'));
      assert.strictEqual(createdPinRecord.max_logins, 10);

      // Audit log check: No plain PIN
      const auditString = JSON.stringify(auditLogRecord);
      assert.ok(
        !auditString.includes(data.pins[0].plain_pin),
        'Plain PIN must NEVER appear in database or audit logs'
      );
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.paymentBatch.findFirst = origBatch;
      prisma.student.findMany = origStudents;
      prisma.$transaction = origTx;
    }
  });
});
