import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma.ts';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/auth/session.ts';
import { GET as exportData } from '../src/app/api/staff/data-protection/export/route.ts';
import { POST as deleteData } from '../src/app/api/staff/data-protection/delete/route.ts';
import { GET as getStaffAuditLogs } from '../src/app/api/staff/audit-logs/route.ts';
import { GET as getAdminAuditLogs } from '../src/app/api/admin/audit-logs/route.ts';

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

describe('NDPA Data Protection, Export, Erasure & Audit Trail Tests', () => {
  test('1. Data export endpoint returns machine-readable JSON without password or PIN hashes', async () => {
    const origSchool = prisma.school.findUnique;
    (prisma.school.findUnique as any) = async () => ({
      id: 'school-1',
      name: 'Grace High',
      slug: 'grace-high',
      created_at: new Date(),
      classes: [{ id: 'c-1', name: 'JSS 1', created_at: new Date() }],
      subjects: [{ id: 'sub-1', name: 'Mathematics', code: 'MTH' }],
      terms: [{ id: 't-1', session: '2026/2027', term_number: 1, status: 'PUBLISHED' }],
      students: [
        {
          id: 'student-1',
          admission_number: 'ADM-001',
          full_name: 'Alice Johnson',
          status: 'ACTIVE',
          created_at: new Date(),
          updated_at: new Date(),
          class: { id: 'c-1', name: 'JSS 1' },
        },
      ],
      results: [
        {
          id: 'res-1',
          student_id: 'student-1',
          term_id: 't-1',
          subject: { name: 'Mathematics', code: 'MTH' },
          ca_score: 35,
          exam_score: 55,
          total: 90,
          grade: 'A',
          remark: 'Excellent',
          status: 'SUBMITTED',
        },
      ],
    });

    try {
      const token = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/data-protection/export', { token });
      const res = await exportData(req);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get('content-type'), 'application/json');
      assert.ok(res.headers.get('content-disposition')?.includes('ndpa-data-export-grace-high'));

      const jsonStr = await res.text();
      assert.strictEqual(jsonStr.includes('password_hash'), false, 'Password hash must never appear in export');
      assert.strictEqual(jsonStr.includes('pin_hash'), false, 'PIN hash must never appear in export');
      const parsed = JSON.parse(jsonStr);
      assert.strictEqual(parsed.compliance.regulation, 'Nigeria Data Protection Act (NDPA) 2023');
      assert.strictEqual(parsed.students.length, 1);
    } finally {
      prisma.school.findUnique = origSchool;
    }
  });

  test('2. Student deletion under NDPA requires mandatory reason and deletes record', async () => {
    const origStudent = prisma.student.findUnique;
    const origDelete = prisma.student.delete;
    let deletedId = '';

    (prisma.student.findUnique as any) = async () => ({
      id: 'student-1',
      school_id: 'school-1',
      admission_number: 'ADM-001',
      full_name: 'Departed Student',
    });

    (prisma.student.delete as any) = async ({ where }: any) => {
      deletedId = where.id;
      return { id: where.id };
    };

    try {
      const token = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/data-protection/delete', {
        token,
        method: 'POST',
        body: {
          scope: 'STUDENT',
          studentId: 'student-1',
          reason: 'Parent written request for academic record withdrawal and erasure under NDPA 2023',
        },
      });

      const res = await deleteData(req);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(deletedId, 'student-1');
      const data = await res.json();
      assert.strictEqual(data.success, true);
    } finally {
      prisma.student.findUnique = origStudent;
      prisma.student.delete = origDelete;
    }
  });

  test('3. Deletion rejects requests with short/missing reasons (< 5 chars)', async () => {
    const token = await tokenFor('school_admin', 'school-1');
    const req = createMockReq('http://localhost/api/staff/data-protection/delete', {
      token,
      method: 'POST',
      body: {
        scope: 'STUDENT',
        studentId: 'student-1',
        reason: 'bye', // Too short
      },
    });

    const res = await deleteData(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /minimum 5 characters/i);
  });

  test('4. School-level purge requires exact confirmation text "DELETE <slug>"', async () => {
    const origSchool = prisma.school.findUnique;
    (prisma.school.findUnique as any) = async () => ({
      id: 'school-1',
      name: 'Grace High',
      slug: 'grace-high',
    });

    try {
      const token = await tokenFor('platform_admin', null);
      const req = createMockReq('http://localhost/api/staff/data-protection/delete', {
        token,
        method: 'POST',
        body: {
          scope: 'SCHOOL',
          schoolId: 'school-1',
          confirmText: 'WRONG CONFIRMATION',
          reason: 'School permanently closed by state ministry',
        },
      });

      const res = await deleteData(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /Confirmation mismatch/i);
    } finally {
      prisma.school.findUnique = origSchool;
    }
  });

  test('5. Audit logs for staff are strictly scoped to school and sanitize sensitive values', async () => {
    const origAuditLogs = prisma.auditLog.findMany;
    let queriedSchoolId = '';

    (prisma.auditLog.findMany as any) = async ({ where }: any) => {
      queriedSchoolId = where.school_id;
      return [
        {
          id: 'log-1',
          action: 'REPRINT_PIN',
          entity: 'Pin',
          entity_id: 'pin-123',
          old_values: { student_id: 's-1', pin_hash: '$2b$10$abc...' },
          new_values: { plain_pin: 'SECRET_PIN', phone: '+2348000000000' },
          reason: 'Damaged card replacement',
          timestamp: new Date(),
          user: { id: 'u-1', name: 'Bursar', email: 'bursar@grace.edu.ng', role: 'school_admin' },
        },
      ];
    };
    (prisma.auditLog.count as any) = async () => 1;

    try {
      const token = await tokenFor('school_admin', 'school-1');
      const req = createMockReq('http://localhost/api/staff/audit-logs', { token });
      const res = await getStaffAuditLogs(req);

      assert.strictEqual(res.status, 200);
      assert.strictEqual(queriedSchoolId, 'school-1');

      const data = await res.json();
      const firstLog = data.auditLogs[0];
      assert.strictEqual(firstLog.new_values.plain_pin, '[REDACTED]', 'Plain PIN must be redacted in audit viewer');
      assert.strictEqual(firstLog.new_values.phone, '[REDACTED]', 'Personal phone must be redacted in audit viewer');
    } finally {
      prisma.auditLog.findMany = origAuditLogs;
    }
  });

  test('6. Platform admin can view all audit logs across schools', async () => {
    const origAuditLogs = prisma.auditLog.findMany;
    (prisma.auditLog.findMany as any) = async () => [];
    (prisma.auditLog.count as any) = async () => 0;

    try {
      const token = await tokenFor('platform_admin', null);
      const req = createMockReq('http://localhost/api/admin/audit-logs?limit=50', { token });
      const res = await getAdminAuditLogs(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(Array.isArray(data.auditLogs), true);
    } finally {
      prisma.auditLog.findMany = origAuditLogs;
    }
  });
});
