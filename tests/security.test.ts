import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware.ts";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
} from "../src/lib/auth/session.ts";

const RESULTS_HOST = "schoola.localhost";
const STAFF_HOST_A = "schoola-staff.localhost";
const STAFF_HOST_B = "schoolb-staff.localhost";
const MAIN_HOST = "localhost";

function req(
  path: string,
  host: string,
  opts: {
    headers?: Record<string, string>;
    token?: string;
    method?: string;
  } = {},
) {
  const headers = new Headers(opts.headers ?? {});
  if (opts.token) headers.set("cookie", `${SESSION_COOKIE_NAME}=${opts.token}`);
  return new NextRequest(new URL(`http://${host}${path}`), {
    method: opts.method ?? "GET",
    headers,
  });
}

// Adjust the field names below if createSessionToken expects different ones.
async function tokenFor(
  role: string,
  slug: string | null,
  schoolId: string | null,
) {
  return createSessionToken({
    id: `test-${role}`,
    email: `${role}@test.local`,
    name: role,
    role,
    school_id: schoolId,
    school_slug: slug,
  } as any);
}

describe("Security tests (middleware)", () => {
  test("Results address serves no admin or staff pages or APIs (404)", async () => {
    const platformToken = await tokenFor("platform_admin", null, null);
    const paths = [
      "/admin",
      "/admin/login",
      "/staff",
      "/staff/login",
      "/api/admin/schools",
      "/api/staff/my-classes",
    ];
    for (const path of paths) {
      for (const token of [undefined, platformToken]) {
        const res = await middleware(req(path, RESULTS_HOST, { token }));
        assert.strictEqual(
          res.status,
          404,
          `${path} on results address (token: ${token ? "yes" : "no"})`,
        );
      }
    }
  });

  test("Results address root is served (PIN login page)", async () => {
    const res = await middleware(req("/", RESULTS_HOST));
    assert.notStrictEqual(res.status, 404);
  });

  test("Unauthenticated protected APIs return 401 on staff and main addresses", async () => {
    const cases: Array<[string, string]> = [
      ["/api/admin/schools", STAFF_HOST_A],
      ["/api/staff/my-classes", STAFF_HOST_A],
      ["/api/staff/classes/123", STAFF_HOST_A],
      ["/api/admin/schools", MAIN_HOST],
    ];
    for (const [path, host] of cases) {
      const res = await middleware(req(path, host));
      assert.strictEqual(res.status, 401, `${path} on ${host}`);
    }
  });

  test("Forged identity and portal headers give no access", async () => {
    const forged = {
      "x-portal-type": "staff",
      "x-school-slug": "schoolb",
      "x-user-id": "someone",
      "x-user-role": "platform_admin",
      "x-user-school-id": "school-b-id",
    };
    for (const [path, host] of [
      ["/api/admin/schools", MAIN_HOST],
      ["/api/staff/my-classes", STAFF_HOST_A],
    ] as Array<[string, string]>) {
      const res = await middleware(req(path, host, { headers: forged }));
      assert.strictEqual(res.status, 401, `${path} with forged headers`);
    }
  });

  test("Staff of school A cannot use school B staff pages (403)", async () => {
    const teacherA = await tokenFor("teacher", "schoola", "school-a-id");
    const res = await middleware(
      req("/staff/my-classes", STAFF_HOST_B, { token: teacherA }),
    );
    assert.strictEqual(res.status, 403);
  });

  test("Teacher is limited to the My Classes pages (403 elsewhere)", async () => {
    const teacherA = await tokenFor("teacher", "schoola", "school-a-id");
    const blocked = await middleware(
      req("/staff", STAFF_HOST_A, { token: teacherA }),
    );
    assert.strictEqual(blocked.status, 403);
    const allowed = await middleware(
      req("/staff/my-classes", STAFF_HOST_A, { token: teacherA }),
    );
    assert.notStrictEqual(allowed.status, 403);
  });

  test("School admin cannot create teachers or assignments (403)", async () => {
    const adminA = await tokenFor("school_admin", "schoola", "school-a-id");
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await middleware(
        req("/api/staff/teachers", STAFF_HOST_A, { token: adminA, method }),
      );
      assert.strictEqual(res.status, 403, method);
    }
  });
});
