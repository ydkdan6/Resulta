import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getAdminGradingScheme, POST as postAdminGradingScheme } from "../src/app/api/admin/grading-scheme/route.ts";
import { GET as getStaffGradingScheme } from "../src/app/api/staff/grading-scheme/route.ts";
import { createSessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth/session.ts";
import { prisma } from "../src/lib/prisma.ts";

function createMockRequest(
  url: string,
  opts: {
    token?: string;
    method?: string;
    body?: any;
  } = {},
) {
  const headers = new Headers();
  if (opts.token) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${opts.token}`);
  }
  if (opts.body) {
    headers.set("content-type", "application/json");
  }
  return new NextRequest(new URL(url, "http://localhost"), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function tokenFor(user: {
  id: string;
  role: "platform_admin" | "school_admin" | "teacher";
  school_id: string | null;
  email?: string;
}) {
  return createSessionToken({
    id: user.id,
    email: user.email ?? `${user.role}@example.com`,
    name: user.role,
    role: user.role,
    school_id: user.school_id,
  });
}

describe("Grading Scheme API & Isolation Tests (Isolated / Mocked DB)", () => {
  // 1. Unauthenticated checks
  test("Unauthenticated request to GET /api/admin/grading-scheme returns 401", async () => {
    const req = createMockRequest("http://localhost/api/admin/grading-scheme?schoolId=123");
    const res = await getAdminGradingScheme(req);
    assert.strictEqual(res.status, 401);
  });

  test("Unauthenticated request to GET /api/staff/grading-scheme returns 401", async () => {
    const req = createMockRequest("http://localhost/api/staff/grading-scheme?classId=123");
    const res = await getStaffGradingScheme(req);
    assert.strictEqual(res.status, 401);
  });

  // 2. Platform Admin permissions check
  test("Non-platform admin (teacher or school_admin) cannot access admin grading-scheme API (403)", async () => {
    const teacherToken = await tokenFor({
      id: "teacher-1",
      role: "teacher",
      school_id: "school-a",
    });
    const schoolAdminToken = await tokenFor({
      id: "admin-a",
      role: "school_admin",
      school_id: "school-a",
    });

    const reqTeacher = createMockRequest("http://localhost/api/admin/grading-scheme?schoolId=school-a", {
      token: teacherToken,
    });
    const resTeacher = await getAdminGradingScheme(reqTeacher);
    assert.strictEqual(resTeacher.status, 403);

    const reqAdmin = createMockRequest("http://localhost/api/admin/grading-scheme?schoolId=school-a", {
      token: schoolAdminToken,
    });
    const resAdmin = await getAdminGradingScheme(reqAdmin);
    assert.strictEqual(resAdmin.status, 403);
  });

  // 3. Teacher restriction: class in another school returns 404
  test("Teacher cannot access grading scheme for class in another school (returns 404)", async () => {
    const teacherToken = await tokenFor({
      id: "teacher-1",
      role: "teacher",
      school_id: "school-a-id",
    });

    // Mock prisma.class.findUnique to return class belonging to school-b
    const originalFindUnique = prisma.class.findUnique;
    (prisma.class as any).findUnique = async () => ({
      id: "class-b-1",
      school_id: "school-b-id",
      name: "Class in School B",
    });

    try {
      const req = createMockRequest("http://localhost/api/staff/grading-scheme?classId=class-b-1", {
        token: teacherToken,
      });
      const res = await getStaffGradingScheme(req);
      assert.strictEqual(res.status, 404);
      const data = await res.json();
      assert.strictEqual(data.error, "Class not found");
    } finally {
      (prisma.class as any).findUnique = originalFindUnique;
    }
  });

  // 4. Teacher restriction: unassigned class in teacher's own school returns 403
  test("Teacher cannot access grading scheme for unassigned class in own school (returns 403)", async () => {
    const teacherToken = await tokenFor({
      id: "teacher-1",
      role: "teacher",
      school_id: "school-a-id",
    });

    const origClassFind = prisma.class.findUnique;
    const origAssignmentFind = prisma.teacherAssignment.findFirst;

    (prisma.class as any).findUnique = async () => ({
      id: "class-a-unassigned",
      school_id: "school-a-id",
      name: "Unassigned Class",
    });
    // No assignment
    (prisma.teacherAssignment as any).findFirst = async () => null;

    try {
      const req = createMockRequest(
        "http://localhost/api/staff/grading-scheme?classId=class-a-unassigned",
        { token: teacherToken },
      );
      const res = await getStaffGradingScheme(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.error, "You are not assigned to this class");
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.teacherAssignment as any).findFirst = origAssignmentFind;
    }
  });

  // 5. Teacher assigned to class returns the grading scheme (200)
  test("Teacher assigned to class gets the grading scheme successfully (returns 200)", async () => {
    const teacherToken = await tokenFor({
      id: "teacher-1",
      role: "teacher",
      school_id: "school-a-id",
    });

    const origClassFind = prisma.class.findUnique;
    const origAssignmentFind = prisma.teacherAssignment.findFirst;
    const origSchemeFind = (prisma as any).gradingScheme?.findFirst;

    (prisma.class as any).findUnique = async () => ({
      id: "class-a-assigned",
      school_id: "school-a-id",
      name: "Assigned Class",
    });
    (prisma.teacherAssignment as any).findFirst = async () => ({
      id: "assignment-1",
      teacher_id: "teacher-1",
      class_id: "class-a-assigned",
      school_id: "school-a-id",
    });
    (prisma as any).gradingScheme = {
      ...(prisma as any).gradingScheme,
      findFirst: async () => ({
        id: "scheme-1",
        school_id: "school-a-id",
        name: "Standard WAEC",
        parts: [
          { name: "CA1", max: 20 },
          { name: "CA2", max: 20 },
          { name: "Exam", max: 60 },
        ],
        boundaries: [
          { grade: "A", min: 70, max: 100, remark: "Excellent" },
          { grade: "F", min: 0, max: 39, remark: "Fail" },
        ],
      }),
    };

    try {
      const req = createMockRequest(
        "http://localhost/api/staff/grading-scheme?classId=class-a-assigned",
        { token: teacherToken },
      );
      const res = await getStaffGradingScheme(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.id, "scheme-1");
      assert.strictEqual(data.name, "Standard WAEC");
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.teacherAssignment as any).findFirst = origAssignmentFind;
      if (origSchemeFind) {
        (prisma as any).gradingScheme.findFirst = origSchemeFind;
      }
    }
  });
});
