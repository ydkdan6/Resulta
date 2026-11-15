import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getTemplate } from "../src/app/api/admin/schools/[id]/roster/template/route.ts";
import { POST as postPreview } from "../src/app/api/admin/schools/[id]/roster/preview/route.ts";
import { POST as postImport } from "../src/app/api/admin/schools/[id]/roster/import/route.ts";
import { POST as postSchools } from "../src/app/api/admin/schools/route.ts";
import { createSessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth/session.ts";
import { prisma } from "../src/lib/prisma.ts";

function createMockReq(
  url: string,
  opts: {
    token?: string;
    method?: string;
    body?: any;
    formData?: FormData;
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
    method: opts.method ?? (opts.body || opts.formData ? "POST" : "GET"),
    headers,
    body: opts.formData ? (opts.formData as any) : opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function tokenFor(role: "platform_admin" | "school_admin" | "teacher", school_id: string | null = null) {
  return createSessionToken({
    id: `user-${role}`,
    email: `${role}@example.com`,
    name: role,
    role,
    school_id,
  });
}

describe("POST /api/admin/schools – Validation & Auth Tests", () => {
  test("Unauthenticated request returns 401", async () => {
    const req = createMockReq("http://localhost/api/admin/schools", {
      body: { name: "Test School", slug: "test-school" },
    });
    const res = await postSchools(req);
    assert.strictEqual(res.status, 401);
  });

  test("Non-platform admin returns 403", async () => {
    const token = await tokenFor("school_admin", "school-1");
    const req = createMockReq("http://localhost/api/admin/schools", {
      token,
      body: { name: "Test School", slug: "test-school" },
    });
    const res = await postSchools(req);
    assert.strictEqual(res.status, 403);
  });

  test("Rejects reserved slugs (admin, www, api, staff, results)", async () => {
    const token = await tokenFor("platform_admin");
    for (const reserved of ["admin", "www", "api", "staff", "results"]) {
      const req = createMockReq("http://localhost/api/admin/schools", {
        token,
        body: { name: "Reserved School", slug: reserved },
      });
      const res = await postSchools(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.ok(data.error.includes("reserved"));
    }
  });

  test("Rejects slugs ending in -staff", async () => {
    const token = await tokenFor("platform_admin");
    const req = createMockReq("http://localhost/api/admin/schools", {
      token,
      body: { name: "Staff School", slug: "kingscollege-staff" },
    });
    const res = await postSchools(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("reserved or invalid"));
  });

  test("Rejects oversized logo file (>2MB) or invalid image format", async () => {
    const token = await tokenFor("platform_admin");
    const fd = new FormData();
    fd.append("name", "Big Logo School");
    fd.append("slug", "big-logo-school");
    // Create oversized fake file
    const oversized = new Blob([new Uint8Array(2 * 1024 * 1024 + 10)], { type: "image/png" });
    fd.append("logo", oversized, "large.png");

    const req = createMockReq("http://localhost/api/admin/schools", {
      token,
      formData: fd,
    });
    const res = await postSchools(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes("exceeds 2 MB") || data.error.includes("image"));
  });

  test("Defaults card_price 1000 and platform_share 500 when not supplied", async () => {
    const token = await tokenFor("platform_admin");
    const origFind = prisma.school.findUnique;
    const origCreate = prisma.school.create;

    let createdData: any = null;
    (prisma.school as any).findUnique = async () => null; // slug unique
    (prisma.school as any).create = async ({ data }: any) => {
      createdData = data;
      return { id: "school-123", ...data };
    };

    try {
      const req = createMockReq("http://localhost/api/admin/schools", {
        token,
        body: { name: "New School", slug: "new-school" },
      });
      const res = await postSchools(req);
      assert.strictEqual(res.status, 201);
      assert.strictEqual(createdData.card_price, 1000);
      assert.strictEqual(createdData.platform_share, 500);
    } finally {
      (prisma.school as any).findUnique = origFind;
      (prisma.school as any).create = origCreate;
    }
  });
});

describe("Platform Admin Roster APIs – Template, Preview, Import", () => {
  // 1. Template
  test("GET /api/admin/schools/[id]/roster/template requires platform_admin and returns CSV without '#' comment", async () => {
    const teacherToken = await tokenFor("teacher", "school-1");
    const reqForbidden = createMockReq("http://localhost/api/admin/schools/s1/roster/template", {
      token: teacherToken,
    });
    const resForbidden = await getTemplate(reqForbidden, { params: Promise.resolve({ id: "s1" }) });
    assert.strictEqual(resForbidden.status, 403);

    const adminToken = await tokenFor("platform_admin");
    const reqOk = createMockReq("http://localhost/api/admin/schools/s1/roster/template", {
      token: adminToken,
    });
    const resOk = await getTemplate(reqOk, { params: Promise.resolve({ id: "s1" }) });
    assert.strictEqual(resOk.status, 200);
    const text = await resOk.text();
    assert.ok(text.includes("admission_number,full_name,class"));
    assert.ok(!text.startsWith("#"));
  });

  // 2. Preview
  test("POST /api/admin/schools/[id]/roster/preview parses and computes preview counts", async () => {
    const adminToken = await tokenFor("platform_admin");
    const origSchoolFind = prisma.school.findUnique;

    (prisma.school as any).findUnique = async () => ({
      id: "s1",
      classes: [{ id: "c1", name: "JSS 1A" }],
      students: [
        {
          admission_number: "2026/0001",
          full_name: "Existing Student",
          class: { name: "JSS 1A" },
        },
      ],
    });

    const csvContent = [
      "admission_number,full_name,class",
      "2026/0001,Existing Student,JSS 1A", // UNCHANGED
      "2026/0002,New Student,JSS 1A", // NEW
      "0042,Another Student,JSS 1B", // NEW + Unknown Class
    ].join("\n");

    const fd = new FormData();
    fd.append("file", new Blob([csvContent], { type: "text/csv" }), "students.csv");

    try {
      const req = createMockReq("http://localhost/api/admin/schools/s1/roster/preview", {
        token: adminToken,
        formData: fd,
      });
      const res = await postPreview(req, { params: Promise.resolve({ id: "s1" }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.totalRows, 3);
      assert.strictEqual(data.unchangedCount, 1);
      assert.strictEqual(data.newCount, 2);
      assert.ok(data.unknownClasses.includes("JSS 1B"));
    } finally {
      (prisma.school as any).findUnique = origSchoolFind;
    }
  });

  // 3. Import Re-validation
  test("POST /api/admin/schools/[id]/roster/import fully re-validates rows on server", async () => {
    const adminToken = await tokenFor("platform_admin");
    const origSchoolFind = prisma.school.findUnique;

    (prisma.school as any).findUnique = async () => ({
      id: "s1",
      classes: [{ id: "c1", name: "JSS 1A" }],
      students: [],
    });

    const invalidRows = [
      { rowNumber: 2, admission_number: "", full_name: "No Admission", class_name: "JSS 1A" },
    ];

    try {
      const req = createMockReq("http://localhost/api/admin/schools/s1/roster/import", {
        token: adminToken,
        body: { rows: invalidRows, skipBadRows: false },
      });
      const res = await postImport(req, { params: Promise.resolve({ id: "s1" }) });
      assert.strictEqual(res.status, 422);
      const data = await res.json();
      assert.ok(data.error.includes("contain errors"));
    } finally {
      (prisma.school as any).findUnique = origSchoolFind;
    }
  });

  // 4. Complete List Flagging & Transaction Batching
  test("POST /api/admin/schools/[id]/roster/import flags unlisted students when isCompleteList is true", async () => {
    const adminToken = await tokenFor("platform_admin");
    const origSchoolFind = prisma.school.findUnique;
    const origTx = prisma.$transaction;

    const existingStudents = [
      { id: "s-1", admission_number: "ADM-1", full_name: "Present Student", class_id: "c1", class: { name: "JSS 1" } },
      { id: "s-2", admission_number: "ADM-2", full_name: "Absent Student", class_id: "c1", class: { name: "JSS 1" } },
    ];

    (prisma.school as any).findUnique = async () => ({
      id: "s1",
      classes: [{ id: "c1", name: "JSS 1" }],
      students: existingStudents,
    });

    let flaggedIds: string[] = [];
    (prisma as any).$transaction = async (callback: any) => {
      const mockTx = {
        class: { create: async () => ({ id: "c-new" }) },
        student: {
          create: async () => ({}),
          update: async () => ({}),
          updateMany: async ({ where }: any) => {
            flaggedIds = where.id.in;
          },
        },
        studentImport: { create: async () => ({ id: "import-1" }) },
        auditLog: { create: async () => ({ id: "audit-1" }) },
      };
      return callback(mockTx);
    };

    const importRows = [
      { rowNumber: 2, admission_number: "ADM-1", full_name: "Present Student", class_name: "JSS 1" },
    ];

    try {
      const req = createMockReq("http://localhost/api/admin/schools/s1/roster/import", {
        token: adminToken,
        body: { rows: importRows, isCompleteList: true },
      });
      const res = await postImport(req, { params: Promise.resolve({ id: "s1" }) });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.flaggedNotInUploadCount, 1);
      assert.ok(flaggedIds.includes("s-2"));
    } finally {
      (prisma.school as any).findUnique = origSchoolFind;
      (prisma as any).$transaction = origTx;
    }
  });
});
