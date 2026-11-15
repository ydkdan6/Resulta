// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, SESSION_COOKIE_NAME } from "@/lib/auth/session";

type Portal = "staff" | "results" | null;

const SPOOFABLE_HEADERS = [
  "x-portal-type",
  "x-school-slug",
  "x-user-id",
  "x-user-role",
  "x-user-school-id",
];

const RESULTS_ALLOWED_PREFIXES = ["/_next/", "/api/parent/"];

function parseHost(rawHost: string): { slug: string | null; portal: Portal } {
  const hostname = rawHost.split(":")[0].toLowerCase();
  const configured = (process.env.PLATFORM_DOMAIN || "localhost")
    .split(":")[0]
    .toLowerCase();
  const bases = Array.from(new Set([configured, "localhost"]));

  for (const base of bases) {
    if (!hostname.endsWith(`.${base}`)) continue;
    const label = hostname.slice(0, -(base.length + 1));
    if (!/^[a-z0-9-]+$/.test(label) || label === "www") {
      return { slug: null, portal: null };
    }
    if (label.endsWith("-staff")) {
      const slug = label.slice(0, -"-staff".length);
      return slug ? { slug, portal: "staff" } : { slug: null, portal: null };
    }
    return { slug: label, portal: "results" };
  }
  return { slug: null, portal: null };
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || request.nextUrl.host || "";
  const { slug: schoolSlug, portal } = parseHost(host);

  // Remove anything the client may have forged, then set our own values.
  const requestHeaders = new Headers(request.headers);
  for (const h of SPOOFABLE_HEADERS) requestHeaders.delete(h);
  if (schoolSlug) requestHeaders.set("x-school-slug", schoolSlug);
  if (portal) requestHeaders.set("x-portal-type", portal);

  const pass = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  const json = (body: object, status: number) =>
    NextResponse.json(body, { status });

  // 1. Results address: decided first, before any login check.
  if (portal === "results") {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = `/${schoolSlug}`;
      return NextResponse.rewrite(url, {
        request: { headers: requestHeaders },
      });
    }
    if (
      pathname === "/favicon.ico" ||
      RESULTS_ALLOWED_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
      return pass();
    }
    return new NextResponse("Not Found", { status: 404 });
  }

  // 2. Session
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  if (session) {
    requestHeaders.set("x-user-id", session.id);
    requestHeaders.set("x-user-role", session.role);
    if (session.school_id)
      requestHeaders.set("x-user-school-id", session.school_id);
  }

  // 3. Cross-school check on a staff address (fails closed).
  const crossSchoolExempt =
    pathname === "/staff/login" || pathname.startsWith("/api/auth/");
  if (
    portal === "staff" &&
    session &&
    session.role !== "platform_admin" &&
    !crossSchoolExempt
  ) {
    if (session.school_slug !== schoolSlug) {
      return json({ error: "Forbidden: Cross-tenant access violation." }, 403);
    }
  }

  // 4. Unauthenticated API calls (login routes are exempt).
  if (
    pathname.startsWith("/api/") &&
    !session &&
    !pathname.startsWith("/api/auth/")
  ) {
    return json({ error: "Unauthenticated" }, 401);
  }

  // 5. Platform admin pages
  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login") {
      if (session?.role === "platform_admin") {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
      return pass();
    }
    if (!session)
      return NextResponse.redirect(new URL("/admin/login", request.url));
    if (session.role !== "platform_admin") {
      return json(
        { error: "Forbidden: Platform administrator privileges required." },
        403,
      );
    }
    return pass();
  }

  // 6. Staff pages
  if (pathname.startsWith("/staff")) {
    if (pathname === "/staff/login") {
      if (
        session &&
        (session.role === "school_admin" || session.role === "teacher")
      ) {
        const target =
          session.role === "teacher" ? "/staff/my-classes" : "/staff";
        return NextResponse.redirect(new URL(target, request.url));
      }
      return pass();
    }
    if (!session)
      return NextResponse.redirect(new URL("/staff/login", request.url));
    if (!["school_admin", "teacher", "platform_admin"].includes(session.role)) {
      return json({ error: "Forbidden: Staff privileges required." }, 403);
    }
    if (session.role === "teacher") {
      const allowedTeacherPaths = [
        "/staff/my-classes",
        "/staff/change-password",
        "/staff/logout",
      ];
      const allowed = allowedTeacherPaths.some(
        (p) => pathname === p || pathname.startsWith(`${p}/`),
      );
      if (!allowed) {
        return json(
          {
            error: "Forbidden: Teachers are restricted to the My Classes page.",
          },
          403,
        );
      }
    }
    return pass();
  }

  // 7. Staff address root: send to the staff area (login first if needed).
  if (portal === "staff" && pathname === "/") {
    if (!session)
      return NextResponse.redirect(new URL("/staff/login", request.url));
    const url = request.nextUrl.clone();
    url.pathname = "/staff";
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  // 8. Protected API routes
  if (pathname.startsWith("/api/admin")) {
    if (session?.role !== "platform_admin") {
      return json(
        { error: "Forbidden: Platform admin privileges required." },
        403,
      );
    }
    return pass();
  }

  if (pathname.startsWith("/api/staff/teachers")) {
    if (
      ["POST", "PUT", "DELETE"].includes(request.method) &&
      session?.role !== "platform_admin"
    ) {
      return json(
        {
          error:
            "Forbidden: School administrators cannot create teachers or assignments.",
        },
        403,
      );
    }
    return pass();
  }

  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
