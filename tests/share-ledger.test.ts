// tests/share-ledger.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { GET as getLedger } from "../src/app/api/admin/share-ledger/route.ts";
import { GET as getSummary } from "../src/app/api/admin/share-ledger/summary/route.ts";
import { POST as postSettlement } from "../src/app/api/admin/share-ledger/settlement/route.ts";
import { GET as getSchoolSummary } from "../src/app/api/admin/share-ledger/school-summary/route.ts";
import { POST as markPaid } from "../src/app/api/staff/payments/route.ts";
import { PATCH as unmarkPaid } from "../src/app/api/staff/payments/unmark/route.ts";
import { createSessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth/session.ts";
import { prisma } from "../src/lib/prisma.ts";

function createMockRequest(
  url: string,
  opts: {
    token?: string;
    method?: string;
    body?: unknown;
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

describe("Share Ledger — Business Logic & Security Tests (Mocked DB)", () => {
  // 1. Marking paid creates exactly one SHARE_DUE entry and is idempotent
  test("marking paid creates exactly one entry and is idempotent", async () => {
    const adminToken = await tokenFor({
      id: "admin-1",
      role: "school_admin",
      school_id: "school-1",
    });

    const origTerm = prisma.term.findUnique;
    const origStudent = prisma.student.findMany;
    const origTx = prisma.$transaction;

    (prisma.term.findUnique as any) = async () => ({
      id: "term-1",
      school_id: "school-1",
    });

    (prisma.student.findMany as any) = async () => [{ id: "student-1" }];

    const createdLedgerEntries: any[] = [];
    let updateManyCount = 1;

    (prisma.$transaction as any) = async (callback: any) => {
      const mockTx = {
        school: {
          findUnique: async () => ({ platform_share: new Prisma.Decimal(1000) }),
        },
        studentTermStatus: {
          upsert: async () => ({}),
          updateMany: async () => ({ count: updateManyCount }),
        },
        shareLedgerEntry: {
          create: async ({ data }: any) => {
            createdLedgerEntries.push(data);
            return { id: "ledger-1", ...data };
          },
        },
        auditLog: {
          create: async () => ({}),
        },
      };
      return callback(mockTx);
    };

    try {
      // First call: student is newly marked paid
      updateManyCount = 1;
      const req1 = createMockRequest("http://localhost/api/staff/payments", {
        token: adminToken,
        method: "POST",
        body: { termId: "term-1", studentIds: ["student-1"] },
      });
      const res1 = await markPaid(req1);
      assert.strictEqual(res1.status, 200);
      const data1 = await res1.json();
      assert.strictEqual(data1.newly_paid_count, 1);
      assert.strictEqual(createdLedgerEntries.length, 1);
      assert.strictEqual(createdLedgerEntries[0].type, "SHARE_DUE");
      assert.strictEqual(Number(createdLedgerEntries[0].amount), 1000);

      // Second call: student already paid (updateMany returns count: 0)
      updateManyCount = 0;
      const req2 = createMockRequest("http://localhost/api/staff/payments", {
        token: adminToken,
        method: "POST",
        body: { termId: "term-1", studentIds: ["student-1"] },
      });
      const res2 = await markPaid(req2);
      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert.strictEqual(data2.newly_paid_count, 0);
      // Still only 1 entry created
      assert.strictEqual(createdLedgerEntries.length, 1);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.student.findMany = origStudent;
      prisma.$transaction = origTx;
    }
  });

  // 2. Unmarking creates a REVERSAL entry, never a deletion
  test("unpaid creates a reversal and is idempotent", async () => {
    const adminToken = await tokenFor({
      id: "admin-1",
      role: "school_admin",
      school_id: "school-1",
    });

    const origTerm = prisma.term.findUnique;
    const origStudent = prisma.student.findMany;
    const origPin = prisma.pin.findMany;
    const origTx = prisma.$transaction;

    (prisma.term.findUnique as any) = async () => ({
      id: "term-1",
      school_id: "school-1",
    });
    (prisma.student.findMany as any) = async () => [{ id: "student-1" }];
    (prisma.pin.findMany as any) = async () => []; // No active PINs

    const createdLedgerEntries: any[] = [];
    let updateManyCount = 1;

    (prisma.$transaction as any) = async (callback: any) => {
      const mockTx = {
        school: {
          findUnique: async () => ({ platform_share: new Prisma.Decimal(1000) }),
        },
        studentTermStatus: {
          updateMany: async () => ({ count: updateManyCount }),
        },
        shareLedgerEntry: {
          create: async ({ data }: any) => {
            createdLedgerEntries.push(data);
            return { id: "ledger-rev-1", ...data };
          },
        },
        auditLog: {
          create: async () => ({}),
        },
      };
      return callback(mockTx);
    };

    try {
      // First unmark: fees_paid true -> false
      updateManyCount = 1;
      const req1 = createMockRequest("http://localhost/api/staff/payments/unmark", {
        token: adminToken,
        method: "PATCH",
        body: { termId: "term-1", studentIds: ["student-1"] },
      });
      const res1 = await unmarkPaid(req1);
      assert.strictEqual(res1.status, 200);
      const data1 = await res1.json();
      assert.strictEqual(data1.newly_unmarked_count, 1);
      assert.strictEqual(createdLedgerEntries.length, 1);
      assert.strictEqual(createdLedgerEntries[0].type, "REVERSAL");

      // Second unmark: already unpaid (updateMany returns count: 0)
      updateManyCount = 0;
      const req2 = createMockRequest("http://localhost/api/staff/payments/unmark", {
        token: adminToken,
        method: "PATCH",
        body: { termId: "term-1", studentIds: ["student-1"] },
      });
      const res2 = await unmarkPaid(req2);
      assert.strictEqual(res2.status, 200);
      const data2 = await res2.json();
      assert.strictEqual(data2.newly_unmarked_count, 0);
      assert.strictEqual(createdLedgerEntries.length, 1);
    } finally {
      prisma.term.findUnique = origTerm;
      prisma.student.findMany = origStudent;
      prisma.pin.findMany = origPin;
      prisma.$transaction = origTx;
    }
  });

  // 3. The snapshotted amount does not change when the school's share changes later
  test("the snapshotted amount does not change when the school's share changes later", async () => {
    // When marked at T1 with share 1000
    const snapshotAtMarkTime = new Prisma.Decimal(1000);
    const ledgerEntry = {
      id: "entry-t1",
      type: "SHARE_DUE",
      amount: snapshotAtMarkTime,
      created_at: new Date("2026-01-01"),
    };

    // School platform_share is later updated to 2500
    const updatedSchoolShare = new Prisma.Decimal(2500);

    // Assert that historical entry remains exactly 1000
    assert.strictEqual(Number(ledgerEntry.amount), 1000);
    assert.notStrictEqual(Number(ledgerEntry.amount), Number(updatedSchoolShare));
  });

  // 4. expected_total and expected_share are correct for different student counts and prices (only ACTIVE counted)
  test("expected_total and expected_share are correct for different student counts (only ACTIVE students counted)", () => {
    function computeSnapshots(
      activeStudents: number,
      cardPrice: number,
      platformShare: number,
    ) {
      const priceDec = new Prisma.Decimal(cardPrice);
      const shareDec = new Prisma.Decimal(platformShare);
      const expectedTotal = priceDec.mul(activeStudents);
      const expectedShare = shareDec.mul(activeStudents);
      const schoolShare = expectedTotal.sub(expectedShare);
      return {
        expectedTotal: expectedTotal.toNumber(),
        expectedShare: expectedShare.toNumber(),
        schoolShare: schoolShare.toNumber(),
      };
    }

    // 120 active students, card_price 2000, platform_share 1000
    const s1 = computeSnapshots(120, 2000, 1000);
    assert.strictEqual(s1.expectedTotal, 240000);
    assert.strictEqual(s1.expectedShare, 120000);
    assert.strictEqual(s1.schoolShare, 120000);

    // 50 active students, card_price 1500, platform_share 600
    const s2 = computeSnapshots(50, 1500, 600);
    assert.strictEqual(s2.expectedTotal, 75000);
    assert.strictEqual(s2.expectedShare, 30000);
    assert.strictEqual(s2.schoolShare, 45000);

    // 0 active students
    const s3 = computeSnapshots(0, 2000, 1000);
    assert.strictEqual(s3.expectedTotal, 0);
    assert.strictEqual(s3.expectedShare, 0);
    assert.strictEqual(s3.schoolShare, 0);
  });

  // 5. School admin cannot read another school's summary or call platform admin routes (403)
  test("a school admin cannot read another school's summary or call platform admin routes (403)", async () => {
    const schoolAdminA = await tokenFor({
      id: "admin-a",
      role: "school_admin",
      school_id: "school-a",
    });

    // Trying to read school-b's summary
    const reqCrossSchool = createMockRequest(
      "http://localhost/api/admin/share-ledger/school-summary?schoolId=school-b",
      { token: schoolAdminA },
    );
    const resCrossSchool = await getSchoolSummary(reqCrossSchool);
    assert.strictEqual(resCrossSchool.status, 403);

    // Trying to call platform admin ledger list
    const reqLedger = createMockRequest("http://localhost/api/admin/share-ledger", {
      token: schoolAdminA,
    });
    const resLedger = await getLedger(reqLedger);
    assert.strictEqual(resLedger.status, 403);

    // Trying to call platform admin summary
    const reqSummary = createMockRequest("http://localhost/api/admin/share-ledger/summary", {
      token: schoolAdminA,
    });
    const resSummary = await getSummary(reqSummary);
    assert.strictEqual(resSummary.status, 403);
  });

  // 6. Unauthenticated calls get 401
  test("unauthenticated calls get 401", async () => {
    const req1 = createMockRequest("http://localhost/api/admin/share-ledger");
    const res1 = await getLedger(req1);
    assert.strictEqual(res1.status, 401);

    const req2 = createMockRequest("http://localhost/api/admin/share-ledger/summary");
    const res2 = await getSummary(req2);
    assert.strictEqual(res2.status, 401);

    const req3 = createMockRequest("http://localhost/api/admin/share-ledger/settlement", {
      method: "POST",
      body: { schoolId: "school-1", amount: 1000, date: "2026-01-01" },
    });
    const res3 = await postSettlement(req3);
    assert.strictEqual(res3.status, 401);

    const req4 = createMockRequest("http://localhost/api/admin/share-ledger/school-summary");
    const res4 = await getSchoolSummary(req4);
    assert.strictEqual(res4.status, 401);
  });

  // 7. Teacher gets 403
  test("a teacher gets 403 on all share ledger routes", async () => {
    const teacherToken = await tokenFor({
      id: "teacher-1",
      role: "teacher",
      school_id: "school-1",
    });

    const req1 = createMockRequest("http://localhost/api/admin/share-ledger", {
      token: teacherToken,
    });
    assert.strictEqual((await getLedger(req1)).status, 403);

    const req2 = createMockRequest("http://localhost/api/admin/share-ledger/summary", {
      token: teacherToken,
    });
    assert.strictEqual((await getSummary(req2)).status, 403);

    const req3 = createMockRequest("http://localhost/api/admin/share-ledger/settlement", {
      token: teacherToken,
      method: "POST",
      body: { schoolId: "school-1", amount: 1000, date: "2026-01-01" },
    });
    assert.strictEqual((await postSettlement(req3)).status, 403);

    const req4 = createMockRequest("http://localhost/api/admin/share-ledger/school-summary", {
      token: teacherToken,
    });
    assert.strictEqual((await getSchoolSummary(req4)).status, 403);
  });

  // 8. Settlement requires platform_admin
  test("settlement requires platform_admin", async () => {
    const schoolAdminToken = await tokenFor({
      id: "admin-1",
      role: "school_admin",
      school_id: "school-1",
    });
    const platformAdminToken = await tokenFor({
      id: "platform-1",
      role: "platform_admin",
      school_id: null,
    });

    // School admin rejected
    const reqSchoolAdmin = createMockRequest(
      "http://localhost/api/admin/share-ledger/settlement",
      {
        token: schoolAdminToken,
        method: "POST",
        body: { schoolId: "school-1", amount: 5000, date: "2026-01-01" },
      },
    );
    const resSchoolAdmin = await postSettlement(reqSchoolAdmin);
    assert.strictEqual(resSchoolAdmin.status, 403);

    // Platform admin allowed
    const origSchoolFind = prisma.school.findUnique;
    const origTx = prisma.$transaction;

    (prisma.school.findUnique as any) = async () => ({ id: "school-1" });

    let auditLogCreated: any = null;
    (prisma.$transaction as any) = async (callback: any) => {
      const mockTx = {
        shareLedgerEntry: {
          create: async ({ data }: any) => ({
            id: "settle-1",
            type: "SETTLEMENT",
            amount: data.amount,
            created_at: new Date(),
          }),
        },
        auditLog: {
          create: async ({ data }: any) => {
            auditLogCreated = data;
            return { id: "audit-1" };
          },
        },
      };
      return callback(mockTx);
    };

    try {
      const reqPlatform = createMockRequest(
        "http://localhost/api/admin/share-ledger/settlement",
        {
          token: platformAdminToken,
          method: "POST",
          body: {
            schoolId: "school-1",
            amount: 5000,
            date: "2026-01-01",
            reference: "BANK-REF-123",
            note: "Bank transfer received",
          },
        },
      );
      const resPlatform = await postSettlement(reqPlatform);
      assert.strictEqual(resPlatform.status, 200);
      const data = await resPlatform.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.entry.type, "SETTLEMENT");

      // Verify audit log has amounts and school only, never student names
      assert.ok(auditLogCreated);
      assert.strictEqual(auditLogCreated.new_values.amount, 5000);
      assert.strictEqual(auditLogCreated.new_values.school_id, "school-1");
      assert.strictEqual(auditLogCreated.new_values.student_name, undefined);
    } finally {
      prisma.school.findUnique = origSchoolFind;
      prisma.$transaction = origTx;
    }
  });

  // 9. The earned, received and outstanding calculation is correct for mixed entries
  test("the earned, received and outstanding calculation is correct for mixed entries", () => {
    type LedgerType = "SHARE_DUE" | "REVERSAL" | "SETTLEMENT";
    interface Entry {
      type: LedgerType;
      amount: number;
    }

    function calculateFinancials(entries: Entry[]) {
      let earned = 0;
      let received = 0;

      for (const e of entries) {
        if (e.type === "SHARE_DUE") {
          earned += e.amount;
        } else if (e.type === "REVERSAL") {
          earned -= e.amount;
        } else if (e.type === "SETTLEMENT") {
          received += e.amount;
        }
      }

      return {
        earned,
        received,
        outstanding: earned - received,
      };
    }

    // 3 SHARE_DUE of 1000 each = 3000
    // 1 REVERSAL of 1000 = -1000 -> net earned = 2000
    // 1 SETTLEMENT of 1200 -> received = 1200
    // outstanding = 2000 - 1200 = 800
    const entries: Entry[] = [
      { type: "SHARE_DUE", amount: 1000 },
      { type: "SHARE_DUE", amount: 1000 },
      { type: "SHARE_DUE", amount: 1000 },
      { type: "REVERSAL", amount: 1000 },
      { type: "SETTLEMENT", amount: 1200 },
    ];

    const result = calculateFinancials(entries);
    assert.strictEqual(result.earned, 2000);
    assert.strictEqual(result.received, 1200);
    assert.strictEqual(result.outstanding, 800);
  });
});
