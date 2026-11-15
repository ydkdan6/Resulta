// src/app/api/parent/logout/route.ts
import { NextResponse } from 'next/server';
import { PARENT_SESSION_COOKIE } from '@/lib/auth/parentSession';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete(PARENT_SESSION_COOKIE);
  return response;
}
