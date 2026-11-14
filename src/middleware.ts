// src/middleware.ts
// Middleware that routes requests based on subdomain and enforces security.

import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  // ------------------------------------------------------------
  // 1️⃣ Detect subdomain type (staff vs results)
  // ------------------------------------------------------------
  let schoolSlug: string | null = null;
  let portalType: 'staff' | 'results' | null = null;

  const staffMatch = host.match(/^([a-z0-9-]+)-staff\./i);
  if (staffMatch) {
    schoolSlug = staffMatch[1].toLowerCase();
    portalType = 'staff';
  } else {
    // plain slug subdomain (results portal)
    const slugMatch = host.match(/^([a-z0-9-]+)\./i);
    if (slugMatch) {
      schoolSlug = slugMatch[1].toLowerCase();
      portalType = 'results';
    }
  }

  // ------------------------------------------------------------
  // 2️⃣ Prepare request headers – remove any spoofed values
  // ------------------------------------------------------------
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('x-portal-type');
  requestHeaders.delete('x-school-slug');

  if (schoolSlug) requestHeaders.set('x-school-slug', schoolSlug);
  if (portalType) requestHeaders.set('x-portal-type', portalType);

  // ------------------------------------------------------------
  // 3️⃣ Session handling – expose user data to downstream handlers
  // ------------------------------------------------------------
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (session) {
    requestHeaders.set('x-user-id', session.id);
    requestHeaders.set('x-user-role', session.role);
    if (session.school_id) {
      requestHeaders.set('x-user-school-id', session.school_id);
    }
  }

  // ------------------------------------------------------------
  // 4️⃣ Platform admin routes (/admin/*)
  // ------------------------------------------------------------
  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      if (session?.role === 'platform_admin') {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    if (session.role !== 'platform_admin') {
      return new NextResponse(
        JSON.stringify({ error: 'Forbidden: Platform administrator privileges required.' }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      );
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ------------------------------------------------------------
  // 5️⃣ Staff portal routes (/staff/*)
  // ------------------------------------------------------------
  if (pathname.startsWith('/staff')) {
    if (pathname === '/staff/login') {
      if (session && (session.role === 'school_admin' || session.role === 'teacher')) {
        const target = session.role === 'teacher' ? '/staff/my-classes' : '/staff';
        return NextResponse.redirect(new URL(target, request.url));
      }
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    if (!session) {
      return NextResponse.redirect(new URL('/staff/login', request.url));
    }
    if (!['school_admin', 'teacher', 'platform_admin'].includes(session.role)) {
      return new NextResponse(
        JSON.stringify({ error: 'Forbidden: Staff privileges required.' }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      );
    }
    if (schoolSlug && session.role !== 'platform_admin') {
      if (session.school_slug && session.school_slug !== schoolSlug) {
        return new NextResponse(
          JSON.stringify({ error: 'Forbidden: Cross-tenant access violation.' }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        );
      }
    }
    if (session.role === 'teacher') {
      const allowedTeacherPaths = ['/staff/my-classes', '/staff/change-password', '/staff/logout'];
      const allowed = allowedTeacherPaths.some(p => pathname === p || pathname.startsWith(`${p}/`));
      if (!allowed) {
        return new NextResponse(
          JSON.stringify({ error: 'Forbidden: Teachers are restricted to the My Classes page.' }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        );
      }
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ------------------------------------------------------------
  // 6️⃣ Staff subdomain root rewrite to /staff
  // ------------------------------------------------------------
  if (portalType === 'staff') {
    const allowed = ['/', '/favicon.ico'];
    const isAllowed = allowed.includes(pathname) || pathname.startsWith('/_next');
    if (isAllowed && pathname === '/') {
      const url = request.nextUrl.clone();
      url.pathname = '/staff';
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }
  }

  // ------------------------------------------------------------
  // 7️⃣ Results portal handling (no -staff subdomain)
  // ------------------------------------------------------------
  if (portalType === 'results') {
    const allowed = ['/', '/favicon.ico'];
    const isAllowed = allowed.includes(pathname) || pathname.startsWith('/_next');
    if (!isAllowed) {
      return new NextResponse('Not Found', { status: 404 });
    }
    const url = request.nextUrl.clone();
    url.pathname = `/${schoolSlug ?? 'placeholder'}`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  // ------------------------------------------------------------
  // 8️⃣ Protected API routes
  // ------------------------------------------------------------
  if (pathname.startsWith('/api/admin')) {
    if (!session || session.role !== 'platform_admin') {
      return NextResponse.json({ error: 'Forbidden: Platform admin privileges required.' }, { status: 403 });
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (pathname.startsWith('/api/staff/teachers')) {
    if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
      if (!session || session.role !== 'platform_admin') {
        return NextResponse.json(
          { error: 'Forbidden: School administrators cannot create teachers or assignments.' },
          { status: 403 }
        );
      }
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // ------------------------------------------------------------
  // 9️⃣ Default – pass through unchanged with enriched headers.
  // ------------------------------------------------------------
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
