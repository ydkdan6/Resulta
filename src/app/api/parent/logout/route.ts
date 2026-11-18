// src/app/api/parent/logout/route.ts
import { NextResponse } from 'next/server';
import { clearParentSessionCookie } from '@/lib/auth/parentSession';

export async function POST() {
  const response = NextResponse.json({ success: true });
  clearParentSessionCookie(response);
  return response;
}
