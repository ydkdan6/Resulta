import { NextRequest, NextResponse } from 'next/server';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  // Extract staff subdomain if present: e.g. "grace-high-staff.localhost:3000"
  let schoolSlug: string | null = null;
  let isStaffSubdomain = false;

  const staffSubdomainMatch = host.match(/^([a-z0-9-]+)-staff\./i);
  if (staffSubdomainMatch) {
    schoolSlug = staffSubdomainMatch[1].toLowerCase();
    isStaffSubdomain = true;
  }

  // Clone headers to pass down context to Route Handlers & Server Components
  // Clone headers – we will overwrite any incoming x-portal-type to enforce our own value
  const requestHeaders = new Headers(request.headers);
  // Ensure x-portal-type cannot be spoofed
  requestHeaders.delete('x-portal-type');
  if (schoolSlug) {
    requestHeaders.set('x-school-slug', schoolSlug);
  }
  if (isStaffSubdomain) {
    requestHeaders.set('x-portal-type', 'staff');
  }

  // Check session cookie
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (session) {
    requestHeaders.set('x-user-id', session.id);
    requestHeaders.set('x-user-role', session.role);
    if (session.school_id) {
      requestHeaders.set('x-user-school-id', session.school_id);
    }
  }

  // --- 1. Platform Admin Routes (/admin/*) ---
  if (pathname.startsWith('/admin')) {
    // Allow public access to admin login
    if (pathname === '/admin/login') {
      if (session?.role === 'platform_admin') {
        return NextResponse.redirect(new URL('/admin', request.url));
      }
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // Require platform_admin role
    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    if (session.role !== 'platform_admin') {
      // Unauthorised role returns 403 Forbidden
      return new NextResponse(
        JSON.stringify({ error: 'Forbidden: Platform administrator privileges required.' }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      );
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // --- 2. Staff Portal Routes (/staff/*) ---
  if (pathname.startsWith('/staff')) {
    // Allow public access to staff login
    if (pathname === '/staff/login') {
      if (session && (session.role === 'school_admin' || session.role === 'teacher')) {
        const target = session.role === 'teacher' ? '/staff/my-classes' : '/staff';
        return NextResponse.redirect(new URL(target, request.url));
      }
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // Require authentication
    if (!session) {
      return NextResponse.redirect(new URL('/staff/login', request.url));
    }

    // Role check: Only school_admin and teacher can access /staff routes
    if (session.role !== 'school_admin' && session.role !== 'teacher' && session.role !== 'platform_admin') {
      return new NextResponse(
        JSON.stringify({ error: 'Forbidden: Staff privileges required.' }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      );
    }

    // Tenant check: If accessed on a staff subdomain, verify tenant match
    if (schoolSlug && session.role !== 'platform_admin') {
      if (session.school_slug && session.school_slug !== schoolSlug) {
        return new NextResponse(
          JSON.stringify({ error: 'Forbidden: Cross-tenant access violation.' }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        );
      }
    }

    // Teacher restriction: Teachers can see ONLY their 'My classes' page, change password, or logout
    if (session.role === 'teacher') {
      const allowedTeacherPaths = [
        '/staff/my-classes',
        '/staff/change-password',
        '/staff/logout',
      ];

      const isAllowed = allowedTeacherPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
      if (!isAllowed) {
        return new NextResponse(
          JSON.stringify({ error: 'Forbidden: Teachers are restricted to the My Classes page.' }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        );
      }
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // --- 3. Protected API Routes (/api/*) ---
  if (pathname.startsWith('/api/admin')) {
    if (!session || session.role !== 'platform_admin') {
      return NextResponse.json(
        { error: 'Forbidden: Platform admin privileges required.' },
        { status: 403 }
      );
    }
  }

  if (pathname.startsWith('/api/staff/teachers')) {
    // BRIEF.md rule: school_admin cannot create teachers or assignments. Only platform_admin can.
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
      if (!session || session.role !== 'platform_admin') {
        return NextResponse.json(
          { error: 'Forbidden: School administrators cannot create teachers or assignments.' },
          { status: 403 }
        );
      }
    }
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
