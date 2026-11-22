import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as saveScores } from '../src/app/api/staff/scores/save/route.ts';
import { POST as submitScores } from '../src/app/api/staff/scores/submit/route.ts';
import { GET as getScores } from '../src/app/api/staff/scores/route.ts';
import { prisma } from '../src/lib/prisma.ts';
import { createSessionToken } from '../src/lib/auth/session.ts';

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
    headers.set('cookie', `resulta_session=${opts.token}`);
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

describe('Score Idempotency, Immutability & Audit Logging', () => {
  const schoolId = 'school-123';
  const teacherId = 'teacher-123';
  const classId = 'class-123';
  const subjectId = 'subject-123';
  const termId = 'term-123';
  const student1Id = 'stud-1';
  const student2Id = 'stud-2';

  let token: string;
  let storedResults: Map<string, any>;
  let auditLogs: any[];

  beforeEach(async () => {
    token = await createSessionToken({
      id: teacherId,
      email: 'teacher@school.com',
      name: 'Teacher Joe',
      role: 'teacher',
      school_id: schoolId,
    });

    storedResults = new Map();
    auditLogs = [];

    // Mock Prisma Class
    (prisma.class.findUnique as any) = async () => ({
      id: classId,
      name: 'JSS 1A',
      school_id: schoolId,
      students: [
        { id: student1Id, admission_number: 'ADM001', full_name: 'Alice A', department_id: null, status: 'ACTIVE' },
        { id: student2Id, admission_number: 'ADM002', full_name: 'Bob B', department_id: null, status: 'ACTIVE' },
      ],
    });

    // Mock Prisma Student
    (prisma.student.findUnique as any) = async ({ where }: any) => {
      if (where.id === student1Id) {
        return { id: student1Id, school_id: schoolId, class_id: classId, department_id: null, admission_number: 'ADM001', full_name: 'Alice A' };
      }
      if (where.id === student2Id) {
        return { id: student2Id, school_id: schoolId, class_id: classId, department_id: null, admission_number: 'ADM002', full_name: 'Bob B' };
      }
      return null;
    };

    // Mock Prisma Subject
    (prisma.subject.findUnique as any) = async () => ({
      id: subjectId,
      name: 'Mathematics',
      code: 'MTH',
      school_id: schoolId,
    });

    // Mock Prisma Term
    (prisma.term.findUnique as any) = async () => ({
      id: termId,
      session: '2026/2027',
      term_number: 1,
      status: 'DRAFT',
      school_id: schoolId,
    });

    // Mock Teacher Assignment
    (prisma.teacherAssignment.findFirst as any) = async () => ({
      id: 'assign-1',
      teacher_id: teacherId,
      school_id: schoolId,
      class_id: classId,
      subject_id: subjectId,
      department_id: null,
    });

    (prisma.teacherAssignment.findMany as any) = async () => [
      {
        id: 'assign-1',
        department_id: null,
      },
    ];

    // Mock Department Subjects
    (prisma.departmentSubject.findMany as any) = async () => [];

    // Mock Grading Schemes
    (prisma.gradingScheme.findMany as any) = async () => [
      {
        id: 'scheme-1',
        name: 'Standard Secondary',
        class_level: null,
        school_id: schoolId,
        parts: [
          { name: 'CA1', max: 20 },
          { name: 'CA2', max: 20 },
          { name: 'Exam', max: 60 },
        ],
        boundaries: [
          { grade: 'A', min: 70, max: 100, remark: 'Excellent' },
          { grade: 'B', min: 60, max: 69, remark: 'Very Good' },
          { grade: 'C', min: 50, max: 59, remark: 'Credit' },
          { grade: 'F', min: 0, max: 49, remark: 'Fail' },
        ],
      },
    ];

    // Mock Result Queries
    (prisma.result.findFirst as any) = async ({ where }: any) => {
      for (const [_, res] of storedResults) {
        if (where.status && res.status !== where.status) continue;
        if (where.student_id?.in && !where.student_id.in.includes(res.student_id)) continue;
        return res;
      }
      return null;
    };

    (prisma.result.findMany as any) = async ({ where }: any) => {
      const list = [];
      for (const [_, res] of storedResults) {
        if (where.student_id?.in && !where.student_id.in.includes(res.student_id)) continue;
        if (where.status && res.status !== where.status) continue;
        list.push(res);
      }
      return list;
    };

    (prisma.result.upsert as any) = async ({ where, create, update }: any) => {
      const key = `${create.student_id}:${create.term_id}:${create.subject_id}`;
      const existing = storedResults.get(key);
      const data = existing ? { ...existing, ...update } : { id: `res-${storedResults.size + 1}`, ...create };
      storedResults.set(key, data);
      return data;
    };

    (prisma.$transaction as any) = async (ops: any) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops);
      }
      if (typeof ops === 'function') {
        return ops(prisma);
      }
      return ops;
    };

    (prisma.auditLog.create as any) = async ({ data }: any) => {
      auditLogs.push(data);
      return { id: `audit-${auditLogs.length}`, ...data };
    };
  });

  test('1. Save draft: stores exact part numbers without mutation or addition', async () => {
    const payload = {
      classId,
      subjectId,
      termId,
      scores: [
        {
          student_id: student1Id,
          admission_number: 'ADM001',
          scores: { CA1: 15, CA2: 10, Exam: 50 },
        },
      ],
    };

    const req = createMockReq('http://localhost/api/staff/scores/save', { token, body: payload });
    const res = await saveScores(req);
    assert.strictEqual(res.status, 200);

    const saved = storedResults.get(`${student1Id}:${termId}:${subjectId}`);
    assert.ok(saved);
    assert.strictEqual(saved.ca_score, 25); // 15 + 10
    assert.strictEqual(saved.exam_score, 50);
    assert.strictEqual(saved.total, 75); // 15 + 10 + 50
    assert.strictEqual(saved.grade, 'A');
    assert.strictEqual(saved.status, 'DRAFT');
  });

  test('2. Save draft again with same inputs: values remain completely identical and never compound', async () => {
    const payload = {
      classId,
      subjectId,
      termId,
      scores: [
        {
          student_id: student1Id,
          admission_number: 'ADM001',
          scores: { CA1: 15, CA2: 10, Exam: 50 },
        },
      ],
    };

    // First save
    const req1 = createMockReq('http://localhost/api/staff/scores/save', { token, body: payload });
    const res1 = await saveScores(req1);
    assert.strictEqual(res1.status, 200);

    // Second save
    const req2 = createMockReq('http://localhost/api/staff/scores/save', { token, body: payload });
    const res2 = await saveScores(req2);
    assert.strictEqual(res2.status, 200);

    const saved = storedResults.get(`${student1Id}:${termId}:${subjectId}`);
    assert.strictEqual(saved.ca_score, 25, 'CA score must not add up on repeated save');
    assert.strictEqual(saved.exam_score, 50, 'Exam score must not add up');
    assert.strictEqual(saved.total, 75, 'Total must equal sum of stored parts');
  });

  test('3. Submit scores: stores status SUBMITTED and values remain exact', async () => {
    const payload = {
      classId,
      subjectId,
      termId,
      confirmed: true,
      scores: [
        {
          student_id: student1Id,
          admission_number: 'ADM001',
          scores: { CA1: 15, CA2: 10, Exam: 50 },
        },
        {
          student_id: student2Id,
          admission_number: 'ADM002',
          scores: { CA1: 10, CA2: 12, Exam: 45 },
        },
      ],
    };

    const req = createMockReq('http://localhost/api/staff/scores/submit', { token, body: payload });
    const res = await submitScores(req);
    assert.strictEqual(res.status, 200);

    const saved1 = storedResults.get(`${student1Id}:${termId}:${subjectId}`);
    assert.strictEqual(saved1.ca_score, 25);
    assert.strictEqual(saved1.exam_score, 50);
    assert.strictEqual(saved1.total, 75);
    assert.strictEqual(saved1.status, 'SUBMITTED');

    const saved2 = storedResults.get(`${student2Id}:${termId}:${subjectId}`);
    assert.strictEqual(saved2.ca_score, 22);
    assert.strictEqual(saved2.exam_score, 45);
    assert.strictEqual(saved2.total, 67);
    assert.strictEqual(saved2.status, 'SUBMITTED');
  });

  test('4. Idempotency on submit / lock protection: re-submitting or draft saving to locked result is rejected', async () => {
    // Populate submitted record
    storedResults.set(`${student1Id}:${termId}:${subjectId}`, {
      student_id: student1Id,
      term_id: termId,
      subject_id: subjectId,
      ca_score: 25,
      exam_score: 50,
      total: 75,
      status: 'SUBMITTED',
    });

    const submitPayload = {
      classId,
      subjectId,
      termId,
      confirmed: true,
      scores: [
        {
          student_id: student1Id,
          admission_number: 'ADM001',
          scores: { CA1: 15, CA2: 10, Exam: 50 },
        },
        {
          student_id: student2Id,
          admission_number: 'ADM002',
          scores: { CA1: 10, CA2: 12, Exam: 45 },
        },
      ],
    };

    // Re-submission must be rejected
    const reqSubmit = createMockReq('http://localhost/api/staff/scores/submit', { token, body: submitPayload });
    const resSubmit = await submitScores(reqSubmit);
    assert.strictEqual(resSubmit.status, 403);
    const dataSubmit = await resSubmit.json();
    assert.match(dataSubmit.error, /locked/i);

    // Save draft to submitted results must be rejected
    const savePayload = {
      classId,
      subjectId,
      termId,
      scores: [
        {
          student_id: student1Id,
          admission_number: 'ADM001',
          scores: { CA1: 20, CA2: 20, Exam: 60 },
        },
      ],
    };

    const reqSave = createMockReq('http://localhost/api/staff/scores/save', { token, body: savePayload });
    const resSave = await saveScores(reqSave);
    assert.strictEqual(resSave.status, 403);
    const dataSave = await resSave.json();
    assert.match(dataSave.error, /locked/i);
  });

  test('5. Edit after unlock writes audit log with before/after changes', async () => {
    // Suppose results were unlocked by school admin and are back to DRAFT
    storedResults.set(`${student1Id}:${termId}:${subjectId}`, {
      student_id: student1Id,
      term_id: termId,
      subject_id: subjectId,
      ca_score: 25,
      exam_score: 50,
      total: 75,
      status: 'DRAFT',
    });

    // Teacher saves updated score after unlock
    const editPayload = {
      classId,
      subjectId,
      termId,
      scores: [
        {
          student_id: student1Id,
          admission_number: 'ADM001',
          scores: { CA1: 18, CA2: 12, Exam: 55 }, // CA=30, Exam=55, Total=85
        },
      ],
    };

    const req = createMockReq('http://localhost/api/staff/scores/save', { token, body: editPayload });
    const res = await saveScores(req);
    assert.strictEqual(res.status, 200);

    // Assert Audit log was created for the edit
    const scoreEditLog = auditLogs.find((l) => l.action === 'SCORE_EDIT_AFTER_UNLOCK');
    assert.ok(scoreEditLog, 'Audit log for SCORE_EDIT_AFTER_UNLOCK must be recorded');
    assert.strictEqual(scoreEditLog.entity, 'Result');

    // Values stored accurately
    const updated = storedResults.get(`${student1Id}:${termId}:${subjectId}`);
    assert.strictEqual(updated.ca_score, 30);
    assert.strictEqual(updated.exam_score, 55);
    assert.strictEqual(updated.total, 85);
  });
});
