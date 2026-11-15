import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware.ts';
import { createSessionToken, SessionUser } from '../src/lib/auth/session.ts';

/** Helper to build a request with optional cookie token */
function makeRequest(path: string, host: string, token?: string) {
  const url = new URL(`http://${host}${path}`);
  const headers: Record<string, string> = {};
  if (token) {
    headers['cookie'] = `resulta_session=${token}`;
  }
  return new NextRequest(url, { headers: new Headers(headers) });
}

describe('Security integration tests', () => {
  // 1. School A staff cannot access School B data via admin API
  test('School A staff cannot access School B admin endpoint', async () => {
    const staffUser: SessionUser = {
      id: 'staffA',
      email: 'staffA@example.com',
      name: 'Staff A',
      role: 'school_admin',
      school_id: 'schoolA',
      school_slug: 'schoolA',
    };
    const token = await createSessionToken(staffUser);
    const req = makeRequest('/api/admin/schools', 'schoolB-staff.localhost', token);
    const res = await middleware(req);
    // Staff from School A should be blocked when trying to access School B admin APIs
    assert.ok([403, 404, 307].includes(res.status), `Unexpected status ${res.status}`);
  });

  // 2. Teacher cannot see classes they are not assigned to
  test('Teacher cannot view unassigned class', async () => {
    const teacherUser: SessionUser = {
      id: 'teacherA',
      email: 'tA@example.com',
      name: 'Teacher A',
      role: 'teacher',
      school_id: 'schoolA',
      school_slug: 'schoolA',
    };
    const token = await createSessionToken(teacherUser);
    // Assume class ID 9999 does not belong to teacher A
    const req = makeRequest('/api/staff/classes/9999', 'schoolA.localhost', token);
    const res = await middleware(req);
    // Teacher should be rejected (403) or redirected (307) if not authorized
    assert.ok([403, 307].includes(res.status), `Unexpected status ${res.status}`);
  });

  // 3. Results address serves only PIN login – admin API should 404
  test('Results portal blocks admin API routes', async () => {
    const req = makeRequest('/api/admin/schools', 'schoolA.localhost');
    const res = await middleware(req);
    // Middleware treats results portal as dynamic route and should return 404 for /api/*
    assert.strictEqual(res.status, 404);
  });

  // 4. Fake x-portal-type / x-school-slug headers give no extra access
  test('Fake headers do not grant unauthorized access', async () => {
    const req = makeRequest('/api/admin/schools', 'schoolA.localhost', undefined);
    // Add malicious headers
    req.headers.set('x-portal-type', 'staff');
    req.headers.set('x-school-slug', 'schoolB');
    const res = await middleware(req);
    // Should still be blocked – 404 for results portal or redirect (307) for unauthenticated
    assert.ok([404, 307].includes(res.status), `Unexpected status ${res.status}`);
  });

  // 5. Unauthenticated admin and staff APIs return 401 (or redirect)
  test('Unauthenticated admin and staff API requests are rejected', async () => {
    const adminReq = makeRequest('/api/admin/schools', 'schoolA.localhost');
    const staffReq = makeRequest('/api/staff/classes', 'schoolA-staff.localhost');
    const adminRes = await middleware(adminReq);
    const staffRes = await middleware(staffReq);
    // Middleware redirects to login for unauthenticated – status 307
    assert.strictEqual(adminRes.status, 307);
    assert.strictEqual(staffRes.status, 307);
  });
});
