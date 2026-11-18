import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma.ts';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth/session.ts';
import { GET as getStudents } from '../src/app/api/staff/students/route.ts';
import { PATCH as updateStudent } from '../src/app/api/staff/students/[id]/route.ts';
import { PATCH as updateSchool } from '../src/app/api/staff/school/route.ts';
import { GET as getClassDetails } from '../src/app/api/staff/classes/[id]/route.ts';
import { POST as reprintPin } from '../src/app/api/staff/pins/reprint/route.ts';
import { POST as markPayments } from '../src/app/api/staff/payments/route.ts';
import { POST as parentLogin } from '../src/app/api/parent/login/route.ts';
import { hashPin } from '../src/lib/auth/pin.ts';

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
    headers.set('cookie', `${SESSION_COOKIE_NAME}=${opts.token}`);
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

async function tokenFor(
  role: 'platform_admin' | 'school_admin' | 'teacher',
  school_id: string | null = 'school-1',
  school_slug: string | null = 'school-1-slug'
) {
  return createSessionToken({
    id: `user-${role}-${school_id}`,
    email: `${role}@${school_slug}.edu.ng`,
    name: `${role} ${school_id}`,
    role,
    school_id,
    school_slug,
  });
}

describe('Cross-School Tenant Isolation & Security Tests', () => {
  test('1. School A admin cannot access School B student list', async () => {
    const origFindMany = prisma.student.findMany;
    let queriedSchoolId = '';
    (prisma.student.findMany as any) = async ({ where }: any) => {
      queriedSchoolId = where.school_id;
      return [];
    };
    (prisma.student.count as any) = async () => 0;
    (prisma.school.findUnique as any) = async () => ({
      id: 'school-a',
      roster_confirmed_at: null,
      roster_confirmed_count: null,
    });

    try {
      const token = await tokenFor('school_admin', 'school-a', 'school-a');
      const req = createMockReq('http://localhost/api/staff/students', { token });
      const res = await getStudents(req);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(queriedSchoolId, 'school-a', 'Query must be strictly scoped to session school_id');
    } finally {
      prisma.student.findMany = origFindMany;
    }
  });

  test('2. School A admin cannot edit a student belonging to School B (returns 404)', async () => {
    const origFindUnique = prisma.student.findUnique;
    // Student belongs to school-b
    (prisma.student.findUnique as any) = async ({ where }: any) => {
      return {
        id: 'student-b',
        school_id: 'school-b',
        admission_number: 'ADM-B',
        full_name: 'Bob from School B',
        class_id: 'class-b',
      };
    };

    try {
      const tokenA = await tokenFor('school_admin', 'school-a', 'school-a');
      const req = createMockReq('http://localhost/api/staff/students/student-b', {
        token: tokenA,
        method: 'PATCH',
        body: { fullName: 'Hacked Name' },
      });
      const res = await updateStudent(req, { params: Promise.resolve({ id: 'student-b' }) });
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error, 'Student not found');
    } finally {
      prisma.student.findUnique = origFindUnique;
    }
  });

  test('3. School A admin cannot modify School B settings via PATCH /api/staff/school (returns 403)', async () => {
    const tokenA = await tokenFor('school_admin', 'school-a', 'school-a');
    const req = createMockReq('http://localhost/api/staff/school', {
      token: tokenA,
      method: 'PATCH',
      body: { school_id: 'school-b', name: 'Malicious Rename' },
    });

    const res = await updateSchool(req);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /forbidden/i);
  });

  test('4. School A admin cannot view School B class details (returns 404)', async () => {
    const origFindUnique = prisma.class.findUnique;
    (prisma.class.findUnique as any) = async () => ({
      id: 'class-b-1',
      school_id: 'school-b',
      name: 'Class B',
      students: [],
    });

    try {
      const tokenA = await tokenFor('school_admin', 'school-a', 'school-a');
      const req = createMockReq('http://localhost/api/staff/classes/class-b-1', { token: tokenA });
      const res = await getClassDetails(req, { params: Promise.resolve({ id: 'class-b-1' }) });
      assert.strictEqual(res.status, 404);
    } finally {
      prisma.class.findUnique = origFindUnique;
    }
  });

  test('5. School A admin cannot reprint PIN for School B student (returns 404)', async () => {
    const origFindUnique = prisma.student.findUnique;
    const origTermFindUnique = prisma.term.findUnique;
    const origSchoolFindUnique = prisma.school.findUnique;

    (prisma.student.findUnique as any) = async () => ({
      id: 'student-b-99',
      school_id: 'school-b',
      admission_number: 'ADM-99',
      full_name: 'Foreign Student',
      class: { name: 'JSS 1' },
      termStatuses: [{ fees_paid: true, result_locked: false }],
    });
    (prisma.term.findUnique as any) = async () => ({
      id: 'term-1',
      school_id: 'school-a',
      session: '2026/2027',
      term_number: 1,
    });
    (prisma.school.findUnique as any) = async () => ({
      id: 'school-a',
      name: 'School A',
      slug: 'school-a',
    });

    try {
      const tokenA = await tokenFor('school_admin', 'school-a', 'school-a');
      const req = createMockReq('http://localhost/api/staff/pins/reprint', {
        token: tokenA,
        method: 'POST',
        body: {
          studentId: 'student-b-99',
          termId: 'term-1',
          reason: 'Valid reprint request for damaged card',
        },
      });
      const res = await reprintPin(req);
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.match(data.error, /not found in your school/i);
    } finally {
      prisma.student.findUnique = origFindUnique;
      prisma.term.findUnique = origTermFindUnique;
      prisma.school.findUnique = origSchoolFindUnique;
    }
  });

  test('6. Parent with PIN for School A cannot login to School B results portal', async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;

    (prisma.school.findUnique as any) = async ({ where }: any) => {
      if (where.slug === 'school-b') {
        return { id: 'school-b', name: 'School B', slug: 'school-b' };
      }
      return null;
    };

    // Student ADM-ALICE does not exist in School B
    (prisma.student.findFirst as any) = async ({ where }: any) => {
      if (where.school_id === 'school-b' && where.admission_number === 'ADM-ALICE') {
        return null;
      }
      return null;
    };

    try {
      const req = createMockReq('http://localhost/api/parent/login', {
        method: 'POST',
        body: {
          schoolSlug: 'school-b',
          admissionNumber: 'ADM-ALICE',
          pin: '2345679ACD',
        },
      });
      const res = await parentLogin(req);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.error, 'Invalid admission number or PIN.');
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
    }
  });
});
