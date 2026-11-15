import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'platform_admin' | 'school_admin' | 'teacher';
  school_id: string | null;
  school_slug?: string | null;
  school_name?: string | null;
  must_change_password?: boolean;
}

const SESSION_COOKIE_NAME = 'resulta_session';
const SESSION_DURATION = 60 * 60 * 24 * 7; // 7 days in seconds

function getSecretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET || process.env.PIN_HMAC_SECRET || 'resulta-session-secret-change-in-production-2026';
  return new TextEncoder().encode(secret);
}

/**
 * Creates a signed JWT session token valid across Node and Edge runtimes.
 */
export async function createSessionToken(user: SessionUser): Promise<string> {
  const secret = getSecretKey();
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(secret);
}

/**
 * Verifies and decodes a signed JWT session token.
 */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
    });

    return {
      id: payload.id as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as SessionUser['role'],
      school_id: (payload.school_id as string) || null,
      school_slug: (payload.school_slug as string) || null,
      school_name: (payload.school_name as string) || null,
      must_change_password: Boolean(payload.must_change_password),
    };
  } catch {
    return null;
  }
}

/**
 * Retrieves the current session user from Next.js request cookies.
 */
export async function getSession(request?: NextRequest): Promise<SessionUser | null> {
  // During static prerender there is no request cookie store; safely return null.
  try {
    let token = request?.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const cookieStore = await cookies();
      token = (cookieStore as any).get?.(SESSION_COOKIE_NAME)?.value;
    }
    if (!token) return null;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}



/**
 * Sets the secure HTTP-only session cookie.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  const isProduction = process.env.NODE_ENV === 'production';

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });
}

/**
 * Clears the session cookie on logout.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export { SESSION_COOKIE_NAME };
