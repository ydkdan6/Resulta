import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  clearSessionCookie,
  verifySessionToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  // Read the role first, so we know which login page to send them to.
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  await clearSessionCookie();

  const loginPath =
    session?.role === "platform_admin" ? "/admin/login" : "/staff/login";

  // 303 makes the browser follow the redirect with a GET request.
  return NextResponse.redirect(new URL(loginPath, request.url), 303);
}
