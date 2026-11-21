import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma.ts';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth/session.ts';
import { POST as generatePins } from '../src/app/api/staff/pins/generate/route.ts';
import { POST as reprintPin } from '../src/app/api/staff/pins/reprint/route.ts';

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
  school_id: string | null = 'school-1'
) {
  return createSessionToken({
    id: `user-${role}`,
    email: `${role}@example.com`,
    name: role,
    role,
    school_id,
  });
}

describe('Payment-Gated PIN Generation & Reprint Lifecycle Tests', () => {
  test('1. PIN generation does not require a payment batch (batch gating removed)', async () => {
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origStudents = prisma.student.findMany;
    const origTx = prisma.$transaction;

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
    (prisma.student.findMany as any) = async () => [
      {
        id: 'student-1',
        admission_number: 'ADM-001',
        full_name: 'Paid Student',
        status: 'ACTIVE',
        class: { id: 'c-1', name: 'JSS 1' },
        termStatuses: [{ fees_paid: true, result_locked: false }],
      },
    ];

    let createdPin: any = null;
    (prisma.$transaction as any) = async (cb: any) => {
      const mockTx = {
        term: { findMany: async () => [] },
        pin: {
          updateMany: async () => ({ count: 0 }),
          create: async ({ data }: any) => {
            createdPin = data;
            return { id: 'pin-1', ...data };
          },
        },
        auditLog: { create: async () => ({}) },
      };
      return cb(mockTx);
    };

    try {
      const token = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/pins/generate', {
        token,
        method: 'POST',
        body: { termId: 'term-1', studentIds: ['student-1'] },
      });
      const res = await generatePins(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.generated_count, 1);
      assert.ok(createdPin);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.student.findMany = origStudents;
      prisma.$transaction = origTx;
    }
  });

  test('2. Fails with 400 when no paid students exist for term', async () => {
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origStatus = prisma.studentTermStatus.findMany;

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
    });
    (prisma.studentTermStatus.findMany as any) = async () => [];

    try {
      const token = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/pins/generate', {
        token,
        method: 'POST',
        body: { termId: 'term-1' },
      });
      const res = await generatePins(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /No paid students found/i);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.studentTermStatus.findMany = origStatus;
    }
  });

  test('3. Rejects students whose fees are not marked as paid', async () => {
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origBatch = prisma.paymentBatch.findFirst;
    const origStudents = prisma.student.findMany;

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
    });
    (prisma.paymentBatch.findFirst as any) = async () => ({
      id: 'batch-confirmed-1',
      status: 'CONFIRMED',
    });

    // Student has fees_paid = false
    (prisma.student.findMany as any) = async () => [
      {
        id: 'student-unpaid',
        admission_number: 'ADM-UNPAID',
        full_name: 'Unpaid Student',
        status: 'ACTIVE',
        class: { id: 'c-1', name: 'JSS 1' },
        termStatuses: [{ fees_paid: false, result_locked: false }],
      },
    ];

    try {
      const token = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/pins/generate', {
        token,
        method: 'POST',
        body: { termId: 'term-1', studentIds: ['student-unpaid'] },
      });
      const res = await generatePins(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /No eligible students/i);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.paymentBatch.findFirst = origBatch;
      prisma.student.findMany = origStudents;
    }
  });

  test('4. Successful PIN generation creates bcrypt-hashed PIN and expires earlier terms', async () => {
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origBatch = prisma.paymentBatch.findFirst;
    const origStudents = prisma.student.findMany;
    const origTx = prisma.$transaction;

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
      id: 'batch-confirmed-2',
      status: 'CONFIRMED',
    });

    (prisma.student.findMany as any) = async () => [
      {
        id: 'student-1',
        admission_number: 'ADM-001',
        full_name: 'Paid Student',
        status: 'ACTIVE',
        class: { id: 'c-1', name: 'JSS 1' },
        termStatuses: [{ fees_paid: true, result_locked: false }],
      },
    ];

    let expiredEarlierPinsCalled = false;
    let createdPinHash = '';

    (prisma.$transaction as any) = async (callback: any) => {
      const fakeTx = {
        term: {
          findMany: async () => [{ id: 'term-1' }],
        },
        pin: {
          updateMany: async ({ data }: any) => {
            if (data.status === 'EXPIRED') expiredEarlierPinsCalled = true;
          },
          create: async ({ data }: any) => {
            createdPinHash = data.pin_hash;
            return { id: 'new-pin-id' };
          },
        },
        auditLog: {
          create: async () => {},
        },
      };
      return callback(fakeTx);
    };

    try {
      const token = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/pins/generate', {
        token,
        method: 'POST',
        body: { termId: 'term-2', studentIds: ['student-1'] },
      });
      const res = await generatePins(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.generated_count, 1);
      assert.ok(data.pins[0].plain_pin.length === 10, 'Returned plain PIN once for printing');
      assert.ok(createdPinHash.startsWith('$2'), 'Stored PIN must be hashed with bcrypt');
      assert.strictEqual(expiredEarlierPinsCalled, true, 'Earlier term PINs must be marked EXPIRED');
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.paymentBatch.findFirst = origBatch;
      prisma.student.findMany = origStudents;
      prisma.$transaction = origTx;
    }
  });

  test('5. Reprint PIN rejects unpaid students (returns 403)', async () => {
    const origStudent = prisma.student.findUnique;
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;

    (prisma.student.findUnique as any) = async () => ({
      id: 'student-1',
      school_id: 'school-1',
      admission_number: 'ADM-001',
      full_name: 'Student One',
      termStatuses: [{ fees_paid: false, result_locked: false }],
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
    });

    try {
      const token = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/pins/reprint', {
        token,
        method: 'POST',
        body: {
          studentId: 'student-1',
          termId: 'term-1',
          reason: 'Card lost by student',
        },
      });
      const res = await reprintPin(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /fees are not marked as paid/i);
    } finally {
      prisma.student.findUnique = origStudent;
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
    }
  });
});
