import { NextRequest, NextResponse } from 'next/server';
import { getSession, createSessionToken, setSessionCookie } from '@/lib/auth/session';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { prisma } from '@/lib/prisma';
import { ChangePasswordSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(ChangePasswordSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }
    const { currentPassword, newPassword } = validation.data;

    const user = await prisma.user.findUnique({
      where: { id: session.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const isMatch = await verifyPassword(currentPassword, user.password_hash);
    if (!isMatch) {
      return NextResponse.json(
        { error: 'Current password is incorrect.' },
        { status: 400 }
      );
    }

    const newHash = await hashPassword(newPassword);
    const updatedUser = await prisma.user.update({
      where: { id: session.id },
      data: {
        password_hash: newHash,
        must_change_password: false,
      },
      include: { school: true },
    });

    // Update session cookie with must_change_password = false
    const token = await createSessionToken({
      id: updatedUser.id,
      email: updatedUser.email ?? "",
      name: updatedUser.name,
      role: updatedUser.role,
      school_id: updatedUser.school_id,
      school_slug: updatedUser.school?.slug || null,
      school_name: updatedUser.school?.name || null,
      must_change_password: false,
    });
    await setSessionCookie(token);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Password change error', error);
    return NextResponse.json(
      { error: 'Failed to update password.' },
      { status: 500 }
    );
  }
}
