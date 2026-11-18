import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma.ts';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth/session.ts';
import { GET as getClassDetails } from '../src/app/api/staff/classes/[id]/route.ts';
import { POST as saveScores } from '../src/app/api/staff/scores/save/route.ts';
import { POST as submitScores } from '../src/app/api/staff/scores/submit/route.ts';
import { POST as unlockScores } from '../src/app/api/staff/scores/unlock/route.ts';
import { PATCH as updateSchool } from '../src/app/api/staff/school/route.ts';
import { POST as confirmRoster } from '../src/app/api/staff/roster/confirm/route.ts';
import { GET as getPayments } from '../src/app/api/staff/payments/route.ts';
import { POST as generatePins } from '../src/app/api/staff/pins/generate/route.ts';
import { GET as getAuditLogs } from '../src/app/api/staff/audit-logs/route.ts';

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

async function tokenForTeacher(id = 'teacher-1', schoolId = 'school-1') {
  return createSessionToken({
    id,
    email: 'teacher@school.edu.ng',
    name: 'Mr Teacher',
    role: 'teacher',
    school_id: schoolId,
    school_slug: 'school-1',
  });
}

describe('Teacher Scope & Privilege Boundary Tests', () => {
  test('1. Teacher cannot access class they are not assigned to (returns 403)', async () => {
    const origClass = prisma.class.findUnique;
    const origAssignment = prisma.teacherAssignment.findFirst;

    (prisma.class.findUnique as any) = async () => ({
      id: 'class-unassigned',
      school_id: 'school-1',
      name: 'SS 3 Blue',
      teacherAssignments: [],
      students: [],
    });

    // No assignment exists for this teacher
    (prisma.teacherAssignment.findFirst as any) = async () => null;

    try {
      const token = await tokenForTeacher('teacher-1', 'school-1');
      const req = createMockReq('http://localhost/api/staff/classes/class-unassigned', { token });
      const res = await getClassDetails(req, { params: Promise.resolve({ id: 'class-unassigned' }) });
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /not assigned to this class/i);
    } finally {
      prisma.class.findUnique = origClass;
      prisma.teacherAssignment.findFirst = origAssignment;
    }
  });

  test('2. Teacher cannot save scores for unassigned subject / class (returns 403)', async () => {
    const origClass = prisma.class.findUnique;
    const origSubject = prisma.subject.findUnique;
    const origTerm = prisma.term.findUnique;
    const origAssignment = prisma.teacherAssignment.findFirst;

    (prisma.class.findUnique as any) = async () => ({
      id: 'class-1',
      school_id: 'school-1',
      students: [],
    });
    (prisma.subject.findUnique as any) = async () => ({
      id: 'subject-physics',
      school_id: 'school-1',
    });
    (prisma.term.findUnique as any) = async () => ({
      id: 'term-1',
      school_id: 'school-1',
      status: 'DRAFT',
    });
    (prisma.teacherAssignment.findFirst as any) = async () => null;

    try {
      const token = await tokenForTeacher('teacher-1', 'school-1');
      const req = createMockReq('http://localhost/api/staff/scores/save', {
        token,
        method: 'POST',
        body: {
          classId: 'class-1',
          subjectId: 'subject-physics',
          termId: 'term-1',
          scores: [],
        },
      });
      const res = await saveScores(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /not assigned to this subject/i);
    } finally {
      prisma.class.findUnique = origClass;
      prisma.subject.findUnique = origSubject;
      prisma.term.findUnique = origTerm;
      prisma.teacherAssignment.findFirst = origAssignment;
    }
  });

  test('3. Teacher cannot submit scores for unassigned subject / class (returns 403)', async () => {
    const origClass = prisma.class.findUnique;
    const origSubject = prisma.subject.findUnique;
    const origTerm = prisma.term.findUnique;
    const origAssignment = prisma.teacherAssignment.findFirst;

    (prisma.class.findUnique as any) = async () => ({
      id: 'class-1',
      school_id: 'school-1',
      students: [{ id: 'student-1' }],
    });
    (prisma.subject.findUnique as any) = async () => ({
      id: 'subject-math',
      school_id: 'school-1',
    });
    (prisma.term.findUnique as any) = async () => ({
      id: 'term-1',
      school_id: 'school-1',
      status: 'DRAFT',
    });
    (prisma.teacherAssignment.findFirst as any) = async () => null;

    try {
      const token = await tokenForTeacher('teacher-1', 'school-1');
      const req = createMockReq('http://localhost/api/staff/scores/submit', {
        token,
        method: 'POST',
        body: {
          classId: 'class-1',
          subjectId: 'subject-math',
          termId: 'term-1',
          confirmed: true,
          scores: [{ studentId: 'student-1', caScore: 30, examScore: 50 }],
        },
      });
      const res = await submitScores(req);
      assert.strictEqual(res.status, 403);
    } finally {
      prisma.class.findUnique = origClass;
      prisma.subject.findUnique = origSubject;
      prisma.term.findUnique = origTerm;
      prisma.teacherAssignment.findFirst = origAssignment;
    }
  });

  test('4. Teacher cannot unlock submitted scores (returns 403)', async () => {
    const token = await tokenForTeacher('teacher-1', 'school-1');
    const req = createMockReq('http://localhost/api/staff/scores/unlock', {
      token,
      method: 'POST',
      body: {
        classId: 'class-1',
        subjectId: 'subject-1',
        termId: 'term-1',
        reason: 'Teacher wanting to edit scores',
      },
    });

    const res = await unlockScores(req);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /administrators can unlock/i);
  });

  test('5. Teacher cannot modify school settings (returns 403)', async () => {
    const token = await tokenForTeacher('teacher-1', 'school-1');
    const req = createMockReq('http://localhost/api/staff/school', {
      token,
      method: 'PATCH',
      body: { school_id: 'school-1', name: 'New School Name' },
    });

    const res = await updateSchool(req);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /Teachers cannot modify school settings/i);
  });

  test('6. Teacher cannot confirm roster (returns 403)', async () => {
    const token = await tokenForTeacher('teacher-1', 'school-1');
    const req = createMockReq('http://localhost/api/staff/roster/confirm', {
      token,
      method: 'POST',
      body: { confirm: true },
    });

    const res = await confirmRoster(req);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /School administrator privileges required/i);
  });

  test('7. Teacher cannot access payment tracking (returns 403)', async () => {
    const token = await tokenForTeacher('teacher-1', 'school-1');
    const req = createMockReq('http://localhost/api/staff/payments?termId=term-1', {
      token,
    });

    const res = await getPayments(req);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /School administrator privileges required/i);
  });

  test('8. Teacher cannot generate PIN cards (returns 403)', async () => {
    const token = await tokenForTeacher('teacher-1', 'school-1');
    const req = createMockReq('http://localhost/api/staff/pins/generate', {
      token,
      method: 'POST',
      body: { termId: 'term-1' },
    });

    const res = await generatePins(req);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /School administrator privileges required/i);
  });

  test('9. Teacher cannot view audit logs (returns 403)', async () => {
    const token = await tokenForTeacher('teacher-1', 'school-1');
    const req = createMockReq('http://localhost/api/staff/audit-logs', { token });
    const res = await getAuditLogs(req);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /School administrator privileges required/i);
  });
});
