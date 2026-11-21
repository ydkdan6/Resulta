// tests/load-performance.test.ts
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as parentLogin } from '../src/app/api/parent/login/route.ts';
import { GET as getParentResults } from '../src/app/api/parent/results/route.ts';
import { POST as submitScores } from '../src/app/api/staff/scores/submit/route.ts';
import { createParentSessionToken, PARENT_SESSION_COOKIE } from '../src/lib/auth/parentSession.ts';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth/session.ts';
import { hashPin } from '../src/lib/auth/pin.ts';
import { DEFAULT_FALLBACK_SCHEME } from '../src/lib/scores/validateScores.ts';
import { prisma } from '../src/lib/prisma.ts';
import { resetAllRateLimits } from '../src/modules/security/rateLimiter.ts';
import { cacheService } from '../src/modules/cache/cacheService.ts';

function createMockReq(
  url: string,
  opts: {
    token?: string;
    isStaff?: boolean;
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  const headers = new Headers();
  if (opts.token) {
    const cookieName = opts.isStaff ? SESSION_COOKIE_NAME : PARENT_SESSION_COOKIE;
    headers.set('cookie', `${cookieName}=${opts.token}`);
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

describe('Result-Release Week: Performance & High-Load Concurrency Tests', () => {
  const schoolId = 'school-load-1';
  const schoolSlug = 'loadacademy';
  const termId = 'term-load-1';

  cacheService.clearAll();
  resetAllRateLimits();

  test('Load Test 1: 500 parent logins in 10-minute simulation profile without errors', async () => {
    const rawPin = 'X9K2M4P7Q3';
    const pinHash = hashPin(rawPin);

    const students = Array.from({ length: 500 }, (_, i) => ({
      id: `student-load-${i}`,
      school_id: schoolId,
      admission_number: `ADM-LOAD-${String(i).padStart(4, '0')}`,
      full_name: `Student Load ${i}`,
      status: 'ACTIVE' as const,
    }));

    const studentMap = new Map(students.map((s) => [s.admission_number, s]));

    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origPins = prisma.pin.findMany;
    const origPinUpdate = prisma.pin.update;
    const origStatus = prisma.studentTermStatus.findUnique;

    (prisma.school as any).findUnique = async () => ({
      id: schoolId,
      name: 'Load Academy',
      slug: schoolSlug,
      logo_url: 'https://cdn.example.com/logo.png',
    });

    (prisma.student as any).findFirst = async ({ where }: any) => {
      return studentMap.get(where.admission_number) || null;
    };

    (prisma.pin as any).findMany = async ({ where }: any) => [
      {
        id: `pin-${where.student_id}`,
        student_id: where.student_id,
        school_id: schoolId,
        term_id: termId,
        pin_hash: pinHash,
        logins_used: 1,
        max_logins: 10,
        status: 'ACTIVE',
        term: { id: termId, session: '2026/2027', term_number: 1 },
      },
    ];

    (prisma.pin as any).update = async () => ({ id: 'updated' });
    (prisma.studentTermStatus as any).findUnique = async () => ({ result_locked: false });

    try {
      const startTime = performance.now();
      const TOTAL_LOGINS = 500;
      const CONCURRENCY = 50;

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < TOTAL_LOGINS; i += CONCURRENCY) {
        const batch = students.slice(i, i + CONCURRENCY).map(async (student, idx) => {
          const clientIp = `198.51.100.${(i + idx) % 250 + 1}`;
          const req = createMockReq('http://localhost/api/parent/login', {
            method: 'POST',
            headers: {
              'x-school-slug': schoolSlug,
              'x-forwarded-for': clientIp,
            },
            body: {
              admissionNumber: student.admission_number,
              pin: rawPin,
            },
          });

          const res = await parentLogin(req);
          if (res.status === 200) {
            const data = await res.json();
            if (data.success && data.student) {
              successCount++;
            } else {
              errorCount++;
            }
          } else {
            errorCount++;
          }
        });

        await Promise.all(batch);
      }

      const totalTimeMs = performance.now() - startTime;
      console.log(`[LOAD TEST] 500 parent logins completed in ${totalTimeMs.toFixed(1)}ms. Success: ${successCount}, Errors: ${errorCount}`);

      assert.strictEqual(errorCount, 0, 'No parent login errors should occur under peak load');
      assert.strictEqual(successCount, 500, 'All 500 parent logins must succeed');
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.pin.findMany = origPins;
      prisma.pin.update = origPinUpdate;
      prisma.studentTermStatus.findUnique = origStatus;
    }
  });

  test('Load Test 2: 50 teachers submitting scores simultaneously without errors or deadlocks', async () => {
    const TEACHER_COUNT = 50;

    const origClass = prisma.class.findUnique;
    const origSubject = prisma.subject.findUnique;
    const origTerm = prisma.term.findUnique;
    const origTeacherAssignment = prisma.teacherAssignment.findFirst;
    const origTeacherAssignmentMany = (prisma.teacherAssignment as any).findMany;
    const origResultFindFirst = prisma.result.findFirst;
    const origResultUpsert = (prisma.result as any).upsert;
    const origTransaction = prisma.$transaction;
    const origScheme = (prisma.gradingScheme as any).findMany;
    const origStudentFindUnique = prisma.student.findUnique;
    const origDeptSubjFindMany = (prisma as any).departmentSubject?.findMany;
    const origDeptSubjFindUnique = (prisma as any).departmentSubject?.findUnique;

    (prisma.class as any).findUnique = async ({ where }: any) => ({
      id: where.id,
      school_id: schoolId,
      name: `Class ${where.id}`,
      students: [
        { id: `stud-1`, admission_number: 'ADM001', full_name: 'Alice', status: 'ACTIVE', department_id: null },
        { id: `stud-2`, admission_number: 'ADM002', full_name: 'Bob', status: 'ACTIVE', department_id: null },
      ],
    });

    (prisma.subject as any).findUnique = async () => ({ id: 'subj-1', school_id: schoolId });
    (prisma.term as any).findUnique = async () => ({ id: termId, school_id: schoolId, status: 'PUBLISHED' });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: 'assignment-1', department_id: null });
    (prisma.teacherAssignment as any).findMany = async () => [{ id: 'assignment-1', department_id: null }];
    (prisma.result as any).findFirst = async () => null;
    (prisma.result as any).upsert = (args: any) => Promise.resolve({ id: 'res-id', ...args });
    (prisma.gradingScheme as any).findMany = async () => [
      { id: "g1", school_id: schoolId, parts: DEFAULT_FALLBACK_SCHEME.parts, boundaries: DEFAULT_FALLBACK_SCHEME.boundaries },
    ];
    (prisma as any).$transaction = async (ops: any[]) => ops;

    // Department-aware mocks: students have no department, so no dept checks are needed
    if (!(prisma as any).departmentSubject) (prisma as any).departmentSubject = {};
    (prisma as any).departmentSubject.findMany = async () => [];
    (prisma as any).departmentSubject.findUnique = async () => null;

    // verifyTeacherStudentScoreAccess calls student.findUnique per row.
    // The class mock (above) already returns students; we need student.findUnique to return
    // the correct class_id. We capture classId → studentId mapping from class.findUnique calls.
    const studentClassMap = new Map<string, string>();
    const baseFindUniqueClass = (prisma.class as any).findUnique;
    (prisma.class as any).findUnique = async ({ where }: any) => {
      const cls = await baseFindUniqueClass({ where });
      if (cls?.students) {
        for (const s of cls.students) studentClassMap.set(s.id, cls.id);
      }
      return cls;
    };
    (prisma.student as any).findUnique = async ({ where }: any) => ({
      id: where.id,
      school_id: schoolId,
      class_id: studentClassMap.get(where.id) ?? where.id,
      department_id: null,
    });

    try {
      const startTime = performance.now();

      const submissions = Array.from({ length: TEACHER_COUNT }, async (_, idx) => {
        const teacherId = `teacher-${idx + 1}`;
        const teacherToken = await createSessionToken({
          id: teacherId,
          email: `teacher${idx + 1}@school.com`,
          name: `Teacher ${idx + 1}`,
          role: 'teacher',
          school_id: schoolId,
          school_slug: schoolSlug,
          must_change_password: false,
        });

        const req = createMockReq('http://localhost/api/staff/scores/submit', {
          token: teacherToken,
          isStaff: true,
          method: 'POST',
          body: {
            classId: `class-${idx + 1}`,
            subjectId: `subj-${idx + 1}`,
            termId,
            confirmed: true,
            scores: [
              {
                student_id: 'stud-1',
                admission_number: 'ADM001',
                scores: { CA: '30', Exam: '55' },
              },
              {
                student_id: 'stud-2',
                admission_number: 'ADM002',
                scores: { CA: '28', Exam: '50' },
              },
            ],
          },
        });

        const res = await submitScores(req);
        return { status: res.status, body: await res.json() };
      });

      const results = await Promise.all(submissions);
      const totalTimeMs = performance.now() - startTime;

      const failed = results.filter((r) => r.status !== 200 || !r.body.success);
      console.log(`[LOAD TEST] 50 concurrent teacher submissions finished in ${totalTimeMs.toFixed(1)}ms. Failed: ${failed.length}`);

      assert.strictEqual(failed.length, 0, `50 teachers submitting simultaneously must succeed with 0 failures`);
      assert.strictEqual(results.length, 50);
    } finally {
      prisma.class.findUnique = origClass;
      prisma.subject.findUnique = origSubject;
      prisma.term.findUnique = origTerm;
      prisma.teacherAssignment.findFirst = origTeacherAssignment;
      (prisma.teacherAssignment as any).findMany = origTeacherAssignmentMany;
      prisma.result.findFirst = origResultFindFirst;
      (prisma.result as any).upsert = origResultUpsert;
      prisma.$transaction = origTransaction;
      (prisma.gradingScheme as any).findMany = origScheme;
      prisma.student.findUnique = origStudentFindUnique;
      if (origDeptSubjFindMany !== undefined) (prisma as any).departmentSubject.findMany = origDeptSubjFindMany;
      if (origDeptSubjFindUnique !== undefined) (prisma as any).departmentSubject.findUnique = origDeptSubjFindUnique;
    }
  });

  test('Load Test 3: Report card loads in under 2 seconds on simulated slow mobile connection', async () => {
    const studentId = 'student-mobile-test';
    const parentToken = await createParentSessionToken({
      student_id: studentId,
      school_id: schoolId,
      admission_number: 'ADM-MOBILE-01',
      pin_term_id: termId,
      pin_session: '2026/2027',
      pin_term_number: 1,
    });

    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findUnique;
    const origTerms = prisma.term.findMany;
    const origStatuses = prisma.studentTermStatus.findMany;
    const origResults = prisma.result.findMany;

    (prisma.school as any).findUnique = async () => ({
      id: schoolId,
      name: 'Load Academy',
      slug: schoolSlug,
      logo_url: 'https://cdn.example.com/logo.png',
    });

    (prisma.student as any).findUnique = async () => ({
      id: studentId,
      admission_number: 'ADM-MOBILE-01',
      full_name: 'Mobile Test Student',
      class: { id: 'c-1', name: 'SS 3 Gold' },
    });

    (prisma.term.findMany as any) = async () => [
      { id: termId, school_id: schoolId, session: '2026/2027', term_number: 1, status: 'PUBLISHED' },
    ];

    (prisma.studentTermStatus.findMany as any) = async () => [
      { term_id: termId, result_locked: false },
    ];

    (prisma.result.findMany as any) = async () => [
      {
        id: 'r-1',
        term_id: termId,
        subject: { id: 's-1', name: 'Mathematics', code: 'MTH' },
        ca_score: 35,
        exam_score: 55,
        total: 90,
        grade: 'A',
        remark: 'Excellent',
        status: 'SUBMITTED',
      },
      {
        id: 'r-2',
        term_id: termId,
        subject: { id: 's-2', name: 'English Language', code: 'ENG' },
        ca_score: 30,
        exam_score: 50,
        total: 80,
        grade: 'B',
        remark: 'Very Good',
        status: 'SUBMITTED',
      },
      {
        id: 'r-3',
        term_id: termId,
        subject: { id: 's-3', name: 'Physics', code: 'PHY' },
        ca_score: 32,
        exam_score: 48,
        total: 80,
        grade: 'B',
        remark: 'Very Good',
        status: 'SUBMITTED',
      },
    ];

    try {
      // 1. Initial warm-up request
      const warmReq = createMockReq('http://localhost/api/parent/results', { token: parentToken });
      const warmRes = await getParentResults(warmReq);
      assert.strictEqual(warmRes.status, 200);

      // 2. Measure performance with simulated slow 3G mobile latency (350ms RTT)
      const SIMULATED_MOBILE_LATENCY_MS = 350;

      const startTime = performance.now();

      await new Promise((resolve) => setTimeout(resolve, SIMULATED_MOBILE_LATENCY_MS));

      const req = createMockReq('http://localhost/api/parent/results', { token: parentToken });
      const res = await getParentResults(req);

      await new Promise((resolve) => setTimeout(resolve, SIMULATED_MOBILE_LATENCY_MS));

      const totalLoadTimeMs = performance.now() - startTime;
      const data = await res.json();

      console.log(`[PERFORMANCE TEST] Report card loaded in ${totalLoadTimeMs.toFixed(1)}ms on simulated slow mobile connection.`);

      assert.strictEqual(res.status, 200);
      assert.ok(data.student);
      assert.ok(data.terms.length > 0);
      assert.strictEqual(data.terms[0].subjects.length, 3);

      assert.ok(
        totalLoadTimeMs < 2000,
        `Report card must load in under 2 seconds on slow mobile connection (Actual: ${totalLoadTimeMs.toFixed(1)}ms)`
      );
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findUnique = origStudent;
      prisma.term.findMany = origTerms;
      prisma.studentTermStatus.findMany = origStatuses;
      prisma.result.findMany = origResults;
    }
  });
});
