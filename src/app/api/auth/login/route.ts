import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionToken, setSessionCookie } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, school_slug } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { school: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
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
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Authentication failed. Please try again later.' },
      { status: 500 }
    );
  }
}
