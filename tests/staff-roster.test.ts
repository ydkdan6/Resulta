import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getStudents, POST as postStudent } from "../src/app/api/staff/students/route.ts";
import { PATCH as patchStudent } from "../src/app/api/staff/students/[id]/route.ts";
import { POST as postConfirmRoster } from "../src/app/api/staff/roster/confirm/route.ts";
import { createSessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth/session.ts";
import { prisma } from "../src/lib/prisma.ts";

function createMockReq(
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
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function tokenFor(
  role: "platform_admin" | "school_admin" | "teacher",
  school_id: string | null = "school-1",
) {
  return createSessionToken({
    id: `user-${role}`,
    email: `${role}@example.com`,
    name: role,
    role,
    school_id,
  });
}

describe("GET /api/staff/students – Auth, Isolation & Roster Confirmation State", () => {
  test("Unauthenticated request returns 401", async () => {
    const req = createMockReq("http://localhost/api/staff/students");
    const res = await getStudents(req);
    assert.strictEqual(res.status, 401);
  });

  test("Teacher returns 403", async () => {
    const token = await tokenFor("teacher", "school-1");
    const req = createMockReq("http://localhost/api/staff/students", { token });
    const res = await getStudents(req);
    assert.strictEqual(res.status, 403);
  });

  test("Returns students with class info, not_in_latest_upload, and confirmation state (unconfirmed)", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const origFindMany = prisma.student.findMany;
    const origCount = prisma.student.count;
    const origSchoolFindUnique = prisma.school.findUnique;

    (prisma.student as any).findMany = async () => [
      {
        id: "stud-1",
        admission_number: "ADM-001",
        full_name: "Chukwudi Okafor",
        status: "ACTIVE",
        class_id: "class-1",
        not_in_latest_upload: false,
        updated_at: new Date("2026-11-15T10:00:00Z"),
        class: { id: "class-1", name: "JSS 1A" },
      },
      {
        id: "stud-2",
        admission_number: "ADM-002",
        full_name: "Fatima Aliyu",
        status: "ACTIVE",
        class_id: "class-1",
        not_in_latest_upload: true,
        updated_at: new Date("2026-11-15T10:00:00Z"),
        class: { id: "class-1", name: "JSS 1A" },
      },
    ];

    (prisma.student as any).count = async () => 2;

    (prisma.school as any).findUnique = async () => ({
      roster_confirmed_at: null,
      roster_confirmed_count: null,
    });

    try {
      const req = createMockReq("http://localhost/api/staff/students", { token });
      const res = await getStudents(req);
      assert.strictEqual(res.status, 200);

      const data = await res.json();
      assert.strictEqual(data.students.length, 2);
      assert.strictEqual(data.students[0].class.name, "JSS 1A");
      assert.strictEqual(data.students[0].not_in_latest_upload, false);
      assert.strictEqual(data.students[1].not_in_latest_upload, true);
      assert.strictEqual(data.roster_confirmed_at, null);
      assert.strictEqual(data.roster_confirmed_count, null);
      assert.strictEqual(data.changed_since_confirmed, false);
    } finally {
      (prisma.student as any).findMany = origFindMany;
      (prisma.student as any).count = origCount;
      (prisma.school as any).findUnique = origSchoolFindUnique;
    }
  });

  test("Reports changed_since_confirmed = true when active student count differs", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const origFindMany = prisma.student.findMany;
    const origCount = prisma.student.count;
    const origFindFirst = prisma.student.findFirst;
    const origSchoolFindUnique = prisma.school.findUnique;

    (prisma.student as any).findMany = async () => [];
    // Count called for pagination total (10) and active count (10) vs confirmed (8)
    (prisma.student as any).count = async () => 10;
    (prisma.student as any).findFirst = async () => null;

    (prisma.school as any).findUnique = async () => ({
      roster_confirmed_at: new Date("2026-11-15T09:00:00Z"),
      roster_confirmed_count: 8, // Differs from 10!
    });

    try {
      const req = createMockReq("http://localhost/api/staff/students", { token });
      const res = await getStudents(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.changed_since_confirmed, true);
    } finally {
      (prisma.student as any).findMany = origFindMany;
      (prisma.student as any).count = origCount;
      (prisma.student as any).findFirst = origFindFirst;
      (prisma.school as any).findUnique = origSchoolFindUnique;
    }
  });

  test("Reports changed_since_confirmed = true when a student was modified after confirmation", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const origFindMany = prisma.student.findMany;
    const origCount = prisma.student.count;
    const origFindFirst = prisma.student.findFirst;
    const origSchoolFindUnique = prisma.school.findUnique;

    (prisma.student as any).findMany = async () => [];
    (prisma.student as any).count = async () => 10; // Active count matches 10
    // Student modified after
    (prisma.student as any).findFirst = async () => ({ id: "stud-edited" });

    (prisma.school as any).findUnique = async () => ({
      roster_confirmed_at: new Date("2026-11-15T09:00:00Z"),
      roster_confirmed_count: 10,
    });

    try {
      const req = createMockReq("http://localhost/api/staff/students", { token });
      const res = await getStudents(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.changed_since_confirmed, true);
    } finally {
      (prisma.student as any).findMany = origFindMany;
      (prisma.student as any).count = origCount;
      (prisma.student as any).findFirst = origFindFirst;
      (prisma.school as any).findUnique = origSchoolFindUnique;
    }
  });
});

describe("POST /api/staff/students – Add Single Student", () => {
  test("Unauthenticated returns 401, Teacher returns 403", async () => {
    const unauthReq = createMockReq("http://localhost/api/staff/students", {
      body: { admissionNumber: "ADM-1", fullName: "Test", classId: "c1" },
    });
    const unauthRes = await postStudent(unauthReq);
    assert.strictEqual(unauthRes.status, 401);

    const teacherToken = await tokenFor("teacher", "school-1");
    const teacherReq = createMockReq("http://localhost/api/staff/students", {
      token: teacherToken,
      body: { admissionNumber: "ADM-1", fullName: "Test", classId: "c1" },
    });
    const teacherRes = await postStudent(teacherReq);
    assert.strictEqual(teacherRes.status, 403);
  });

  test("Rejects class not in own school", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const origClassFind = prisma.class.findUnique;

    (prisma.class as any).findUnique = async () => ({
      id: "class-other",
      school_id: "school-2", // Belongs to school-2!
    });

    try {
      const req = createMockReq("http://localhost/api/staff/students", {
        token,
        body: { admissionNumber: "ADM-1", fullName: "Test Student", classId: "class-other" },
      });
      const res = await postStudent(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes("Class not found"));
    } finally {
      (prisma.class as any).findUnique = origClassFind;
    }
  });

  test("Rejects duplicate admission number", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const origClassFind = prisma.class.findUnique;
    const origStudentFind = prisma.student.findFirst;

    (prisma.class as any).findUnique = async () => ({ id: "c1", school_id: "school-1" });
    (prisma.student as any).findFirst = async () => ({ id: "existing-student" });

    try {
      const req = createMockReq("http://localhost/api/staff/students", {
        token,
        body: { admissionNumber: "ADM-DUP", fullName: "Duplicate", classId: "c1" },
      });
      const res = await postStudent(req);
      assert.strictEqual(res.status, 409);
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.student as any).findFirst = origStudentFind;
    }
  });

  test("Successfully creates student", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const origClassFind = prisma.class.findUnique;
    const origStudentFind = prisma.student.findFirst;
    const origStudentCreate = prisma.student.create;

    (prisma.class as any).findUnique = async () => ({ id: "c1", school_id: "school-1" });
    (prisma.student as any).findFirst = async () => null;

    let createdPayload: any = null;
    (prisma.student as any).create = async ({ data }: any) => {
      createdPayload = data;
      return { id: "new-s", ...data };
    };

    try {
      const req = createMockReq("http://localhost/api/staff/students", {
        token,
        body: { admissionNumber: "ADM-OK", fullName: "Valid Student", classId: "c1" },
      });
      const res = await postStudent(req);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(createdPayload.admission_number, "ADM-OK");
      assert.strictEqual(createdPayload.full_name, "Valid Student");
      assert.strictEqual(createdPayload.status, "ACTIVE");
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.student as any).findFirst = origStudentFind;
      (prisma.student as any).create = origStudentCreate;
    }
  });
});

describe("PATCH /api/staff/students/[id] – Edit & Status Updates", () => {
  test("Rejects editing admission_number with 400", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const req = createMockReq("http://localhost/api/staff/students/s1", {
      token,
      method: "PATCH",
      body: { admissionNumber: "NEW-ADM" },
    });
    const res = await patchStudent(req, { params: Promise.resolve({ id: "s1" }) });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("Admission number cannot be edited"));
  });

  test("Enforces school isolation: returns 404 for student belonging to another school", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const origStudentFind = prisma.student.findUnique;

    (prisma.student as any).findUnique = async () => ({
      id: "s-other",
      school_id: "school-2", // Different school!
      admission_number: "ADM-99",
      full_name: "Other Student",
      class_id: "c-other",
    });

    try {
      const req = createMockReq("http://localhost/api/staff/students/s-other", {
        token,
        method: "PATCH",
        body: { fullName: "New Name" },
      });
      const res = await patchStudent(req, { params: Promise.resolve({ id: "s-other" }) });
      assert.strictEqual(res.status, 404);
    } finally {
      (prisma.student as any).findUnique = origStudentFind;
    }
  });

  test("Successfully updates full_name, class_id, and status (e.g. TRANSFERRED / LEFT)", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const origStudentFind = prisma.student.findUnique;
    const origClassFind = prisma.class.findUnique;
    const origStudentUpdate = prisma.student.update;

    (prisma.student as any).findUnique = async () => ({
      id: "s1",
      school_id: "school-1",
      admission_number: "ADM-1",
      full_name: "Original Name",
      class_id: "c1",
      status: "ACTIVE",
    });

    (prisma.class as any).findUnique = async () => ({ id: "c2", school_id: "school-1" });

    let updatedPayload: any = null;
    (prisma.student as any).update = async ({ data }: any) => {
      updatedPayload = data;
      return { id: "s1", ...data };
    };

    try {
      const req = createMockReq("http://localhost/api/staff/students/s1", {
        token,
        method: "PATCH",
        body: { fullName: "Updated Name", classId: "c2", status: "TRANSFERRED" },
      });
      const res = await patchStudent(req, { params: Promise.resolve({ id: "s1" }) });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(updatedPayload.full_name, "Updated Name");
      assert.strictEqual(updatedPayload.class_id, "c2");
      assert.strictEqual(updatedPayload.status, "TRANSFERRED");
    } finally {
      (prisma.student as any).findUnique = origStudentFind;
      (prisma.class as any).findUnique = origClassFind;
      (prisma.student as any).update = origStudentUpdate;
    }
  });
});

describe("POST /api/staff/roster/confirm – Confirm Roster", () => {
  test("Teacher returns 403", async () => {
    const teacherToken = await tokenFor("teacher", "school-1");
    const req = createMockReq("http://localhost/api/staff/roster/confirm", {
      token: teacherToken,
      body: { confirm: true },
    });
    const res = await postConfirmRoster(req);
    assert.strictEqual(res.status, 403);
  });

  test("School admin confirms active roster and updates count & timestamp", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const origCount = prisma.student.count;
    const origSchoolUpdate = prisma.school.update;
    const origAuditCreate = prisma.auditLog.create;

    (prisma.student as any).count = async () => 142;

    let updateData: any = null;
    (prisma.school as any).update = async ({ data }: any) => {
      updateData = data;
      return { id: "school-1", ...data };
    };

    (prisma.auditLog as any).create = async () => ({ id: "audit-1" });

    try {
      const req = createMockReq("http://localhost/api/staff/roster/confirm", {
        token,
        body: { confirm: true },
      });
      const res = await postConfirmRoster(req);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(updateData.roster_confirmed_count, 142);
      assert.ok(updateData.roster_confirmed_at instanceof Date);
    } finally {
      (prisma.student as any).count = origCount;
      (prisma.school as any).update = origSchoolUpdate;
      (prisma.auditLog as any).create = origAuditCreate;
    }
  });
});
