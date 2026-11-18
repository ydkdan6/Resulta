import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { LoginSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import { logger } from '@/lib/logger';
import {
  checkStaffLoginRateLimit,
  recordStaffLoginFailure,
  resetStaffLoginAttempts,
} from '@/modules/security/rateLimiter';

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(LoginSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { email, password, school_slug } = validation.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Rate Limit Check
    const rateCheck = checkStaffLoginRateLimit(ip, normalizedEmail);
    if (rateCheck.locked) {
      return NextResponse.json(
        { error: rateCheck.message || 'Too many failed staff login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { school: true },
    });

    if (!user) {
      recordStaffLoginFailure(ip, normalizedEmail);
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      recordStaffLoginFailure(ip, normalizedEmail);
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Tenant check: If logging in on a specific school staff address, enforce tenant match
    if (school_slug && user.role !== 'platform_admin') {
      if (!user.school || user.school.slug !== school_slug.toLowerCase()) {
        return NextResponse.json(
          { error: 'Forbidden: You do not have staff credentials for this school.' },
          { status: 403 }
        );
      }
    }

    // Reset rate limit on successful authentication
    resetStaffLoginAttempts(ip, normalizedEmail);

    // Create session token
    const token = await createSessionToken({
      id: user.id,
      email: user.email ?? "",
      name: user.name,
      role: user.role,
      school_id: user.school_id,
      school_slug: user.school?.slug || null,
      school_name: user.school?.name || null,
      must_change_password: user.must_change_password,
    });

    await setSessionCookie(token);

    // Determine target redirect
    let redirectUrl = '/admin';
    if (user.role === 'teacher') {
      redirectUrl = '/staff/my-classes';
    } else if (user.role === 'school_admin') {
      redirectUrl = '/staff';
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        school_id: user.school_id,
        school_slug: user.school?.slug || null,
        school_name: user.school?.name || null,
        must_change_password: user.must_change_password,
      },
      redirectUrl,
    });
  } catch (error) {
    logger.error('Login error', error);
    return NextResponse.json(
      { error: 'Authentication failed. Please try again later.' },
      { status: 500 }
    );
  }
}
