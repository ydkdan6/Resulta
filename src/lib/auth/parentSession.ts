import { SignJWT, jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';

export const PARENT_SESSION_COOKIE = 'resulta_parent_session';
const PARENT_JWT_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'parent-portal-session-secret-salt-2026'
);

export interface ParentSession {
  student_id: string;
  admission_number: string;
  full_name: string;
  school_id: string;
  school_slug: string;
  pin_id: string;
  pin_term_id: string;
  pin_session: string;
  pin_term_number: number;
}

/**
 * Creates an encrypted JWT session token for parent portal.
 * Lifetime: 30 minutes.
 */
export async function createParentSessionToken(payload: ParentSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(PARENT_JWT_SECRET);
}

/**
 * Verifies a parent session token. Returns null if expired or invalid.
 */
export async function verifyParentSessionToken(token: string): Promise<ParentSession | null> {
  try {
    const { payload } = await jwtVerify(token, PARENT_JWT_SECRET);
    return payload as unknown as ParentSession;
  } catch {
    return null;
  }
}

/**
 * Helper to extract parent session from request cookies.
 */
export async function getParentSession(request: NextRequest): Promise<ParentSession | null> {
  const token = request.cookies.get(PARENT_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyParentSessionToken(token);
}

/**
 * Sets the parent session cookie on response with HTTP-only and HTTPS-secure flags.
 */
export function setParentSessionCookie(response: NextResponse, token: string): void {
  const isSecure =
    process.env.NODE_ENV === 'production' ||
    process.env.COOKIE_SECURE === 'true' ||
    process.env.HTTPS === 'on';

  response.cookies.set(PARENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 60, // 30 minutes
  });
}

/**
 * Clears the parent session cookie.
 */
export function clearParentSessionCookie(response: NextResponse): void {
  const isSecure =
    process.env.NODE_ENV === 'production' ||
    process.env.COOKIE_SECURE === 'true' ||
    process.env.HTTPS === 'on';

  response.cookies.set(PARENT_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
