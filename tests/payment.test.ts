import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getPayments, POST as markPayments } from "../src/app/api/staff/payments/route.ts";
import { PATCH as withholdResult } from "../src/app/api/staff/payments/withhold/route.ts";
import { GET as getComplaints, POST as createComplaint } from "../src/app/api/staff/complaints/route.ts";
import { PATCH as updateComplaint } from "../src/app/api/staff/complaints/[id]/route.ts";
import { GET as getAdminBatches } from "../src/app/api/admin/payment-batches/route.ts";
import { POST as confirmAdminBatch } from "../src/app/api/admin/payment-batches/[id]/confirm/route.ts";
import { POST as generatePins } from "../src/app/api/staff/pins/generate/route.ts";
import { createSessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth/session.ts";
import { prisma } from "../src/lib/prisma.ts";

function createMockReq(
  url: string,
  opts: {
    token?: string;
    method?: string;
    body?: any;
  } = {}
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
  userId = `user-${role}`
) {
  return createSessionToken({
    id: userId,
    email: `${role}@example.com`,
    name: role,
    role,
    school_id,
  });
}

describe("Payment Tracking & PIN Gating System", () => {
  beforeEach(() => {
    // Clear mocks if any
  });

  test("1. GET /api/staff/payments requires school_admin auth", async () => {
    const teacherToken = await tokenFor("teacher", "school-1");
    const req = createMockReq("http://localhost/api/staff/payments?termId=term-1", {
      token: teacherToken,
    });
    const res = await getPayments(req);
    assert.strictEqual(res.status, 403);
  });

  test("2. GET /api/staff/payments requires termId param", async () => {
    const adminToken = await tokenFor("school_admin", "school-1");
    const req = createMockReq("http://localhost/api/staff/payments", {
      token: adminToken,
    });
    const res = await getPayments(req);
    assert.strictEqual(res.status, 400);
  });

  test("3. GET /api/staff/payments returns students and batch statistics", async () => {
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origStudents = prisma.student.findMany;
    const origBatches = prisma.paymentBatch.findMany;

    (prisma.term.findUnique as any) = async () => ({ id: "term-1", school_id: "school-1" });
    (prisma.school.findUnique as any) = async () => ({
      platform_share: 1000,
      card_price: 2000,
    });
    (prisma.student.findMany as any) = async () => [
      {
        id: "stud-1",
        admission_number: "ADM001",
        full_name: "Alice Johnson",
        status: "ACTIVE",
        class: { id: "c-1", name: "JSS 1" },
        termStatuses: [{ fees_paid: true, result_locked: false }],
      },
      {
        id: "stud-2",
        admission_number: "ADM002",
        full_name: "Bob Williams",
        status: "ACTIVE",
        class: { id: "c-1", name: "JSS 1" },
        termStatuses: [],
      },
    ];
    (prisma.paymentBatch.findMany as any) = async () => [
      {
        id: "b-1",
        students_count: 1,
        amount_due: 1000,
        amount_received: 0,
        status: "PENDING",
        created_at: new Date(),
        confirmed_at: null,
      },
    ];

    try {
      const adminToken = await tokenFor("school_admin", "school-1");
      const req = createMockReq("http://localhost/api/staff/payments?termId=term-1", {
        token: adminToken,
      });
      const res = await getPayments(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.students.length, 2);
      assert.strictEqual(data.stats.total_students, 2);
      assert.strictEqual(data.stats.paid_count, 1);
      assert.strictEqual(data.stats.amount_owed, 1000);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.student.findMany = origStudents;
      prisma.paymentBatch.findMany = origBatches;
    }
  });

  test("4. POST /api/staff/payments marks students as paid and creates SHARE_DUE ledger entry", async () => {
    const origTerm = prisma.term.findUnique;
    const origStudents = prisma.student.findMany;
    const origSchool = prisma.school.findUnique;
    const origTx = prisma.$transaction;

    (prisma.term.findUnique as any) = async () => ({ id: "term-1", school_id: "school-1" });
    (prisma.student.findMany as any) = async () => [
      { id: "stud-1", admission_number: "ADM001", full_name: "Alice", termStatuses: [] },
      { id: "stud-2", admission_number: "ADM002", full_name: "Bob", termStatuses: [] },
    ];
    (prisma.school.findUnique as any) = async () => ({ platform_share: 1000 });
    (prisma.$transaction as any) = async (cb: any) => {
      return cb({
        school: {
          findUnique: async () => ({ platform_share: 1000 }),
        },
        studentTermStatus: {
          upsert: async () => ({}),
          updateMany: async () => ({ count: 1 }),
        },
        shareLedgerEntry: {
          create: async () => ({ id: "ledger-new" }),
        },
        auditLog: {
          create: async () => ({}),
        },
      });
    };

    try {
      const adminToken = await tokenFor("school_admin", "school-1");
      const req = createMockReq("http://localhost/api/staff/payments", {
        token: adminToken,
        method: "POST",
        body: {
          termId: "term-1",
          studentIds: ["stud-1", "stud-2"],
        },
      });
      const res = await markPayments(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.updated_count, 2);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.student.findMany = origStudents;
      prisma.school.findUnique = origSchool;
      prisma.$transaction = origTx;
    }
  });

  test("5. POST /api/staff/payments rejects cross-school student marking", async () => {
    const origTerm = prisma.term.findUnique;
    const origStudents = prisma.student.findMany;

    (prisma.term.findUnique as any) = async () => ({ id: "term-1", school_id: "school-1" });
    // Returns only 1 student belonging to school-1, while 2 were requested
    (prisma.student.findMany as any) = async () => [
      { id: "stud-1", admission_number: "ADM001", full_name: "Alice", termStatuses: [] },
    ];

    try {
      const adminToken = await tokenFor("school_admin", "school-1");
      const req = createMockReq("http://localhost/api/staff/payments", {
        token: adminToken,
        method: "POST",
        body: {
          termId: "term-1",
          studentIds: ["stud-1", "foreign-student"],
        },
      });
      const res = await markPayments(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /do not belong to this school/);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.student.findMany = origStudents;
    }
  });

  test("5b. POST /api/staff/payments is idempotent when marking already paid students", async () => {
    const origTerm = prisma.term.findUnique;
    const origStudents = prisma.student.findMany;
    const origTx = prisma.$transaction;

    (prisma.term.findUnique as any) = async () => ({ id: "term-1", school_id: "school-1" });
    (prisma.student.findMany as any) = async () => [
      {
        id: "stud-1",
        admission_number: "ADM001",
        full_name: "Alice",
        termStatuses: [{ fees_paid: true }],
      },
    ];

    (prisma.$transaction as any) = async (cb: any) => {
      return cb({
        school: {
          findUnique: async () => ({ platform_share: 1000 }),
        },
        studentTermStatus: {
          upsert: async () => ({}),
          updateMany: async () => ({ count: 0 }), // already paid
        },
        shareLedgerEntry: {
          create: async () => ({ id: "ledger-new" }),
        },
        auditLog: {
          create: async () => ({}),
        },
      });
    };

    try {
      const adminToken = await tokenFor("school_admin", "school-1");
      const req = createMockReq("http://localhost/api/staff/payments", {
        token: adminToken,
        method: "POST",
        body: {
          termId: "term-1",
          studentIds: ["stud-1"],
        },
      });
      const res = await markPayments(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.newly_paid_count, 0);
      assert.strictEqual(data.already_paid_count, 1);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.student.findMany = origStudents;
      prisma.$transaction = origTx;
    }
  });

  test("6. PATCH /api/staff/payments/withhold toggles result lock with audit log", async () => {
    const origStudent = prisma.student.findUnique;
    const origTerm = prisma.term.findUnique;
    const origUpsert = prisma.studentTermStatus.upsert;
    const origAudit = prisma.auditLog.create;

    let auditLogged = false;
    (prisma.student.findUnique as any) = async () => ({ id: "stud-1", school_id: "school-1" });
    (prisma.term.findUnique as any) = async () => ({ id: "term-1", school_id: "school-1" });
    (prisma.studentTermStatus.upsert as any) = async ({ update }: any) => ({
      student_id: "stud-1",
      term_id: "term-1",
      result_locked: update.result_locked,
    });
    (prisma.auditLog.create as any) = async () => {
      auditLogged = true;
      return {};
    };

    try {
      const adminToken = await tokenFor("school_admin", "school-1");
      const req = createMockReq("http://localhost/api/staff/payments/withhold", {
        token: adminToken,
        method: "PATCH",
        body: {
          studentId: "stud-1",
          termId: "term-1",
          withheld: true,
        },
      });
      const res = await withholdResult(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.result_locked, true);
      assert.strictEqual(auditLogged, true);
    } finally {
      prisma.student.findUnique = origStudent;
      prisma.term.findUnique = origTerm;
      prisma.studentTermStatus.upsert = origUpsert;
      prisma.auditLog.create = origAudit;
    }
  });

  test("7. POST /api/admin/payment-batches/[id]/confirm records received payment and marks batch CONFIRMED", async () => {
    const origFind = prisma.paymentBatch.findUnique;
    const origTx = prisma.$transaction;

    (prisma.paymentBatch.findUnique as any) = async () => ({
      id: "b-1",
      school_id: "school-1",
      amount_due: 5000,
      status: "PENDING",
      school: { id: "school-1", name: "Greenfield" },
    });
    (prisma.$transaction as any) = async (ops: any[]) => {
      return [
        { id: "b-1", status: "CONFIRMED", amount_received: 5000 },
        {},
      ];
    };

    try {
      const platformToken = await tokenFor("platform_admin", null);
      const req = createMockReq("http://localhost/api/admin/payment-batches/b-1/confirm", {
        token: platformToken,
        method: "POST",
        body: { amountReceived: 5000 },
      });
      const res = await confirmAdminBatch(req, {
        params: Promise.resolve({ id: "b-1" }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.batch.status, "CONFIRMED");
    } finally {
      prisma.paymentBatch.findUnique = origFind;
      prisma.$transaction = origTx;
    }
  });

  test("8. PIN GATING: POST /api/staff/pins/generate succeeds without payment batch when fees are paid", async () => {
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origStudents = prisma.student.findMany;
    const origTx = prisma.$transaction;

    (prisma.term.findUnique as any) = async () => ({ id: "term-1", school_id: "school-1", session: "2026/2027", term_number: 1 });
    (prisma.school.findUnique as any) = async () => ({ id: "school-1", name: "Grace High", slug: "grace-high" });
    (prisma.student.findMany as any) = async () => [
      {
        id: "stud-1",
        admission_number: "ADM001",
        full_name: "Alice",
        termStatuses: [{ fees_paid: true, result_locked: false }],
      },
    ];

    let createdPin = false;
    (prisma.$transaction as any) = async (cb: any) => {
      return cb({
        term: { findMany: async () => [] },
        pin: {
          updateMany: async () => ({ count: 0 }),
          create: async () => {
            createdPin = true;
            return { id: "pin-1" };
          },
        },
        auditLog: { create: async () => ({}) },
      });
    };

    try {
      const adminToken = await tokenFor("school_admin", "school-1");
      const req = createMockReq("http://localhost/api/staff/pins/generate", {
        token: adminToken,
        method: "POST",
        body: {
          termId: "term-1",
          studentIds: ["stud-1"],
        },
      });
      const res = await generatePins(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.ok(createdPin);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.student.findMany = origStudents;
      prisma.$transaction = origTx;
    }
  });

  test("9. PIN GATING: POST /api/staff/pins/generate FAILS (403) when student result is withheld", async () => {
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origBatch = prisma.paymentBatch.findFirst;
    const origStudents = prisma.student.findMany;

    (prisma.term.findUnique as any) = async () => ({ id: "term-1", school_id: "school-1" });
    (prisma.school.findUnique as any) = async () => ({ id: "school-1", name: "Grace High", slug: "grace-high" });
    (prisma.paymentBatch.findFirst as any) = async () => ({
      id: "b-conf",
      status: "CONFIRMED",
    });
    // Student fees paid, but result is locked (withheld)
    (prisma.student.findMany as any) = async () => [
      {
        id: "stud-1",
        admission_number: "ADM001",
        full_name: "Alice",
        status: "ACTIVE",
        termStatuses: [{ fees_paid: true, result_locked: true }],
      },
    ];

    try {
      const adminToken = await tokenFor("school_admin", "school-1");
      const req = createMockReq("http://localhost/api/staff/pins/generate", {
        token: adminToken,
        method: "POST",
        body: {
          termId: "term-1",
          studentIds: ["stud-1"],
        },
      });
      const res = await generatePins(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.details[0].reason, "Result is withheld (locked) by administration.");
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.paymentBatch.findFirst = origBatch;
      prisma.student.findMany = origStudents;
    }
  });

  test("10. PIN GATING: POST /api/staff/pins/generate SUCCEEDS when batch is confirmed and fees are paid", async () => {
    const origTerm = prisma.term.findUnique;
    const origSchool = prisma.school.findUnique;
    const origBatch = prisma.paymentBatch.findFirst;
    const origStudents = prisma.student.findMany;
    const origTx = prisma.$transaction;

    (prisma.term.findUnique as any) = async () => ({
      id: "term-1",
      school_id: "school-1",
      session: "2026/2027",
      term_number: 1,
    });
    (prisma.school.findUnique as any) = async () => ({ id: "school-1", name: "Grace High", slug: "grace-high" });
    (prisma.paymentBatch.findFirst as any) = async () => ({
      id: "b-conf",
      status: "CONFIRMED",
    });
    (prisma.student.findMany as any) = async () => [
      {
        id: "stud-1",
        admission_number: "ADM001",
        full_name: "Alice",
        status: "ACTIVE",
        termStatuses: [{ fees_paid: true, result_locked: false }],
      },
    ];
    (prisma.$transaction as any) = async (cb: any) => {
      return cb({
        term: {
          findMany: async () => [],
        },
        pin: {
          updateMany: async () => ({ count: 0 }),
          create: async () => ({}),
        },
        auditLog: {
          create: async () => ({}),
        },
      });
    };

    try {
      const adminToken = await tokenFor("school_admin", "school-1");
      const req = createMockReq("http://localhost/api/staff/pins/generate", {
        token: adminToken,
        method: "POST",
        body: {
          termId: "term-1",
          studentIds: ["stud-1"],
        },
      });
      const res = await generatePins(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.generated_count, 1);
      assert.strictEqual(data.pins.length, 1);
      assert.strictEqual(data.pins[0].plain_pin.length, 10);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.school.findUnique = origSchool;
      prisma.paymentBatch.findFirst = origBatch;
      prisma.student.findMany = origStudents;
      prisma.$transaction = origTx;
    }
  });

  test("11. Parent Complaints: Public POST creates complaint", async () => {
    const origSchool = prisma.school.findUnique;
    const origStudent = prisma.student.findFirst;
    const origTerm = prisma.term.findFirst;
    const origComplaint = prisma.complaint.create;

    (prisma.school.findUnique as any) = async () => ({ id: "school-1" });
    (prisma.student.findFirst as any) = async () => ({ id: "stud-1" });
    (prisma.term.findFirst as any) = async () => ({ id: "term-1" });
    (prisma.complaint.create as any) = async ({ data }: any) => ({
      id: "comp-1",
      ...data,
    });

    try {
      const req = createMockReq("http://localhost/api/staff/complaints", {
        method: "POST",
        body: {
          schoolSlug: "greenfield",
          studentAdmissionNumber: "ADM001",
          message: "I have paid via Bank Transfer on Friday.",
        },
      });
      const res = await createComplaint(req);
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.complaint_id, "comp-1");
    } finally {
      prisma.school.findUnique = origSchool;
      prisma.student.findFirst = origStudent;
      prisma.term.findFirst = origTerm;
      prisma.complaint.create = origComplaint;
    }
  });

  test("12. Parent Complaints: School Admin can view and resolve complaints", async () => {
    const origComplaints = prisma.complaint.findMany;
    const origFind = prisma.complaint.findUnique;
    const origUpdate = prisma.complaint.update;

    (prisma.complaint.findMany as any) = async () => [
      {
        id: "comp-1",
        message: "Payment receipt attached",
        status: "PENDING",
        student: { id: "s-1", admission_number: "ADM001", full_name: "Alice", class: null },
        term: { id: "t-1", session: "2026/2027", term_number: 1 },
      },
    ];
    (prisma.complaint.findUnique as any) = async () => ({ id: "comp-1", school_id: "school-1" });
    (prisma.complaint.update as any) = async ({ data }: any) => ({ id: "comp-1", status: data.status });

    try {
      const adminToken = await tokenFor("school_admin", "school-1");

      // GET
      const getReq = createMockReq("http://localhost/api/staff/complaints?termId=t-1", {
        token: adminToken,
      });
      const getRes = await getComplaints(getReq);
      assert.strictEqual(getRes.status, 200);
      const getData = await getRes.json();
      assert.strictEqual(getData.complaints.length, 1);

      // PATCH (Resolve)
      const patchReq = createMockReq("http://localhost/api/staff/complaints/comp-1", {
        token: adminToken,
        method: "PATCH",
        body: { status: "RESOLVED" },
      });
      const patchRes = await updateComplaint(patchReq, {
        params: Promise.resolve({ id: "comp-1" }),
      });
      assert.strictEqual(patchRes.status, 200);
      const patchData = await patchRes.json();
      assert.strictEqual(patchData.complaint.status, "RESOLVED");
    } finally {
      prisma.complaint.findMany = origComplaints;
      prisma.complaint.findUnique = origFind;
      prisma.complaint.update = origUpdate;
    }
  });
});
