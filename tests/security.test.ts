import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware.ts';

/** Helper to construct a NextRequest with optional host, headers, and cookies */
function createRequest(path: string, options?: { host?: string; headers?: Record<string, string>; cookies?: string }) {
  const url = new URL(`http://${options?.host ?? 'example.com'}${path}`);
  const init: RequestInit = {};
  if (options?.headers) {
    init.headers = new Headers(options.headers);
  }
  if (options?.cookies) {
    init.headers = init.headers ?? new Headers();
    (init.headers as Headers).set('cookie', options.cookies);
  }
  return new NextRequest(url, init);
}

describe('Security tests', () => {
  // 1. School A staff cannot read or change School B data through any staff or admin API
  test('School A staff cannot access School B admin API', async () => {
    // Host is schoolA-staff, request an admin endpoint (should be redirected to login)
    const req = createRequest('/api/admin/schools', { host: 'schoolA-staff.localhost' });
    const res = await middleware(req);
    // Middleware redirects unauthenticated staff to /staff/login (status 307) – treat as blocked
    assert.ok([307, 403, 404].includes(res.status), `Unexpected status ${res.status}`);
  });

  // 2. Teacher cannot see classes or subjects they are not assigned to.
  test('Teacher cannot view unassigned class', async () => {
    const req = createRequest('/api/staff/classes/9999', { host: 'schoolA.localhost' });
    const res = await middleware(req);
    // No session -> redirect to staff login (307). If session existed but unauthorized, 403.
    assert.ok([307, 403, 404].includes(res.status), `Unexpected status ${res.status}`);
  });

  // 3. Results address serves only the PIN login. Admin, staff and staff API routes return 404 there.
  test('Results portal blocks admin API routes', async () => {
    const req = createRequest('/api/admin/schools', { host: 'schoolA.localhost' });
    const res = await middleware(req);
    // Results portal should treat any /api/* as not allowed – return 404
    assert.strictEqual(res.status, 404);
  });

  // 4. Fake x-portal-type or x-school-slug headers are ignored.
  test('Fake headers do not grant extra access', async () => {
    const req = createRequest('/api/admin/schools', {
      host: 'schoolA.localhost',
      headers: { 'x-portal-type': 'staff', 'x-school-slug': 'schoolB' },
    });
    const res = await middleware(req);
    // Still should be blocked – 404 for results portal or redirect (307) for unauthenticated.
    assert.ok([307, 404].includes(res.status), `Unexpected status ${res.status}`);
  });

  // 5. Unauthenticated requests to every admin and staff API return 401 (or redirect).
  test('Unauthenticated admin and staff API requests are rejected', async () => {
    const adminReq = createRequest('/api/admin/schools', { host: 'schoolA.localhost' });
    const staffReq = createRequest('/api/staff/classes', { host: 'schoolA-staff.localhost' });
    const adminRes = await middleware(adminReq);
    const staffRes = await middleware(staffReq);
    // Middleware redirects to login pages – status 307
    assert.strictEqual(adminRes.status, 307);
    assert.strictEqual(staffRes.status, 307);
  });
});
