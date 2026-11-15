import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as parentLogin } from '../src/app/api/parent/login/route.ts';
import { GET as getParentResults } from '../src/app/api/parent/results/route.ts';
import { GET as getParentReportPdf } from '../src/app/api/parent/report-pdf/route.ts';
import {
  createParentSessionToken,
  PARENT_SESSION_COOKIE,
  ParentSession,
} from '../src/lib/auth/parentSession.ts';
import { hashPin } from '../src/lib/auth/pin.ts';
import { prisma } from '../src/lib/prisma.ts';

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

describe('Public Parent Portal & PIN Access Enforcement', () => {
  const pinRaw = 'A2C4E6G8K9';
  const pinHash = hashPin(pinRaw);

  test('1. Rate Limiting: Repeated failed attempts trigger lockout on IP / admission number', async () => {
    const origSchool = prisma.school.findUnique;
    (prisma.school.findUnique as any) = async () => ({ id: 's-1', name: 'Grace High', slug: 'grace' });

    try {
      // 5 consecutive failed login attempts
      for (let i = 0; i < 5; i++) {
        const req = createMockReq('http://localhost/api/parent/login', {
          method: 'POST',
          headers: { 'x-school-slug': 'grace', 'x-forwarded-for': '192.168.10.50' },
          body: { admissionNumber: 'ADM-RATE-TEST', pin: 'WRONGPIN12' },
        });
        const res = await parentLogin(req);
        assert.strictEqual(res.status, 401);
      }

      // 6th attempt should be blocked by rate limiter with 429
      const lockReq = createMockReq('http://localhost/api/parent/login', {
        method: 'POST',
        headers: { 'x-school-slug': 'grace', 'x-forwarded-for': '192.168.10.50' },
        body: { admissionNumber: 'ADM-RATE-TEST', pin: 'WRONGPIN12' },
      });
      const lockRes = await parentLogin(lockReq);
      assert.strictEqual(lockRes.status, 429);
      const data = await lockRes.json();
      assert.match(data.error, /Too many failed attempts/);
    } finally {
      prisma.school.findUnique = origSchool;
    }
  });

  test('2. Card Validation: Expired card returns specific expired message', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origPins = prisma.pin.findMany;

    (prisma.school.findUnique as any) = async () => ({ id: 's-1', slug: 'grace', name: 'Grace High' });
    (prisma.student.findFirst as any) = async () => ({
      id: 'stud-1',
      admission_number: 'ADM001',
      school_id: 's-1',
      full_name: 'Alice',
    });
    (prisma.pin.findMany as any) = async () => [
      {
        id: 'p-1',
        pin_hash: pinHash,
        status: 'EXPIRED',
        term: { id: 't-1', session: '2026/2027', term_number: 1 },
      },
    ];

    try {
      const req = createMockReq('http://localhost/api/parent/login', {
        method: 'POST',
        headers: { 'x-school-slug': 'grace' },
        body: { admissionNumber: 'ADM001', pin: pinRaw },
      });
      const res = await parentLogin(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, "This card has expired. Please use the current term's card.");
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.pin.findMany = origPins;
    }
  });

  test('3. Card Validation: Locked (withheld) results return result not released message', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origPins = prisma.pin.findMany;
    const origStatus = prisma.studentTermStatus.findUnique;

    (prisma.school.findUnique as any) = async () => ({ id: 's-1', slug: 'grace', name: 'Grace High' });
    (prisma.student.findFirst as any) = async () => ({
      id: 'stud-1',
      admission_number: 'ADM001',
      school_id: 's-1',
      full_name: 'Alice',
    });
    (prisma.pin.findMany as any) = async () => [
      {
        id: 'p-1',
        pin_hash: pinHash,
        status: 'ACTIVE',
        max_logins: 10,
        logins_used: 0,
        term_id: 't-1',
        term: { id: 't-1', session: '2026/2027', term_number: 1 },
      },
    ];
    // Result is withheld!
    (prisma.studentTermStatus.findUnique as any) = async () => ({
      result_locked: true,
    });

    try {
      const req = createMockReq('http://localhost/api/parent/login', {
        method: 'POST',
        headers: { 'x-school-slug': 'grace' },
        body: { admissionNumber: 'ADM001', pin: pinRaw },
      });
      const res = await parentLogin(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error, 'Result not released. Please contact the school.');
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.pin.findMany = origPins;
      prisma.studentTermStatus.findUnique = origStatus;
    }
  });

  test('4. Dashboard Security: Old PIN cannot open a newer term', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findUnique;
    const origTerms = prisma.term.findMany;
    const origStatuses = prisma.studentTermStatus.findMany;
    const origResults = prisma.result.findMany;

    // Parent logged in with a Term 1 card (session 2026/2027)
    const sessionToken = await createParentSessionToken({
      student_id: 'stud-1',
      admission_number: 'ADM001',
      full_name: 'Alice',
      school_id: 's-1',
      school_slug: 'grace',
      pin_id: 'p-term-1',
      pin_term_id: 'term-1',
      pin_session: '2026/2027',
      pin_term_number: 1, // Only authorized up to Term 1!
    });

    (prisma.school.findUnique as any) = async () => ({ id: 's-1', name: 'Grace High', slug: 'grace' });
    (prisma.student.findUnique as any) = async () => ({ id: 'stud-1', admission_number: 'ADM001', full_name: 'Alice' });

    // Published terms exist for Term 1 AND Term 2:
    (prisma.term.findMany as any) = async () => [
      { id: 'term-2', session: '2026/2027', term_number: 2, status: 'PUBLISHED' },
      { id: 'term-1', session: '2026/2027', term_number: 1, status: 'PUBLISHED' },
    ];
    (prisma.studentTermStatus.findMany as any) = async () => [];
    (prisma.result.findMany as any) = async () => [];

    try {
      const req = createMockReq('http://localhost/api/parent/results', {
        token: sessionToken,
      });
      const res = await getParentResults(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      // Term 2 must NOT appear! Only Term 1 (up to PIN's term)
      assert.strictEqual(data.terms.length, 1);
      assert.strictEqual(data.terms[0].id, 'term-1');
      assert.strictEqual(data.terms.some((t: any) => t.id === 'term-2'), false, 'Newer term must NEVER appear!');
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findUnique = origStudent;
      prisma.term.findMany = origTerms;
      prisma.studentTermStatus.findMany = origStatuses;
      prisma.result.findMany = origResults;
    }
  });

  test('5. Dashboard Security: Locked or unpublished terms NEVER appear in results', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findUnique;
    const origTerms = prisma.term.findMany;
    const origStatuses = prisma.studentTermStatus.findMany;
    const origResults = prisma.result.findMany;

    // Parent logged in with Term 2 PIN
    const sessionToken = await createParentSessionToken({
      student_id: 'stud-1',
      admission_number: 'ADM001',
      full_name: 'Alice',
      school_id: 's-1',
      school_slug: 'grace',
      pin_id: 'p-term-2',
      pin_term_id: 'term-2',
      pin_session: '2026/2027',
      pin_term_number: 2,
    });

    (prisma.school.findUnique as any) = async () => ({ id: 's-1', name: 'Grace High', slug: 'grace' });
    (prisma.student.findUnique as any) = async () => ({ id: 'stud-1', admission_number: 'ADM001', full_name: 'Alice' });

    // Published terms
    (prisma.term.findMany as any) = async () => [
      { id: 'term-2', session: '2026/2027', term_number: 2, status: 'PUBLISHED' },
      { id: 'term-1', session: '2026/2027', term_number: 1, status: 'PUBLISHED' },
    ];

    // Term 1 result is withheld/locked!
    (prisma.studentTermStatus.findMany as any) = async () => [
      { term_id: 'term-1', result_locked: true },
    ];
    (prisma.result.findMany as any) = async () => [];

    try {
      const req = createMockReq('http://localhost/api/parent/results', {
        token: sessionToken,
      });
      const res = await getParentResults(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      // Locked Term 1 must be filtered out
      assert.strictEqual(data.terms.length, 1);
      assert.strictEqual(data.terms[0].id, 'term-2');
      assert.strictEqual(data.terms.some((t: any) => t.id === 'term-1'), false, 'Locked term must NEVER appear!');
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findUnique = origStudent;
      prisma.term.findMany = origTerms;
      prisma.studentTermStatus.findMany = origStatuses;
      prisma.result.findMany = origResults;
    }
  });

  test('6. Report Card PDF Download: Produces binary PDF for accessible term and blocks newer term', async () => {
    const origTerm = prisma.term.findUnique;
    const origStatus = prisma.studentTermStatus.findUnique;
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findUnique;
    const origResults = prisma.result.findMany;

    const sessionToken = await createParentSessionToken({
      student_id: 'stud-1',
      admission_number: 'ADM001',
      full_name: 'Alice Johnson',
      school_id: 's-1',
      school_slug: 'grace',
      pin_id: 'p-1',
      pin_term_id: 'term-1',
      pin_session: '2026/2027',
      pin_term_number: 1,
    });

    (prisma.term.findUnique as any) = async ({ where }: any) => {
      if (where.id === 'term-future') {
        return { id: 'term-future', school_id: 's-1', session: '2026/2027', term_number: 2, status: 'PUBLISHED' };
      }
      return { id: 'term-1', school_id: 's-1', session: '2026/2027', term_number: 1, status: 'PUBLISHED' };
    };
    (prisma.studentTermStatus.findUnique as any) = async () => ({ result_locked: false });
    (prisma.school.findUnique as any) = async () => ({ name: 'Grace High' });
    (prisma.student.findUnique as any) = async () => ({
      admission_number: 'ADM001',
      full_name: 'Alice Johnson',
      class: { name: 'JSS 1' },
    });
    (prisma.result.findMany as any) = async () => [
      {
        subject: { name: 'Mathematics' },
        ca_score: 35,
        exam_score: 55,
        total: 90,
        grade: 'A',
        remark: 'Distinction',
      },
    ];

    try {
      // 1. PDF download for accessible term
      const req = createMockReq('http://localhost/api/parent/report-pdf?termId=term-1', {
        token: sessionToken,
      });
      const res = await getParentReportPdf(req);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'application/pdf');

      // 2. Access to future term is forbidden (403)
      const futureReq = createMockReq('http://localhost/api/parent/report-pdf?termId=term-future', {
        token: sessionToken,
      });
      const futureRes = await getParentReportPdf(futureReq);
      assert.strictEqual(futureRes.status, 403);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.studentTermStatus.findUnique = origStatus;
      prisma.school.findUnique = origSchool;
      prisma.student.findUnique = origStudent;
      prisma.result.findMany = origResults;
    }
  });
});
