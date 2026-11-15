import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET as getScores } from "../src/app/api/staff/scores/route.ts";
import { POST as saveScores } from "../src/app/api/staff/scores/save/route.ts";
import { POST as submitScores } from "../src/app/api/staff/scores/submit/route.ts";
import { POST as unlockScores } from "../src/app/api/staff/scores/unlock/route.ts";
import { POST as deleteScores } from "../src/app/api/staff/scores/delete/route.ts";
import { GET as getTerms } from "../src/app/api/staff/terms/route.ts";
import { validateScores, DEFAULT_FALLBACK_SCHEME } from "../src/lib/scores/validateScores.ts";
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

const mockStudents = [
  { id: "student-1", admission_number: "ADM-001", full_name: "Amara Okonkwo", status: "ACTIVE" as const },
  { id: "student-2", admission_number: "ADM-002", full_name: "Babajide Adeleke", status: "ACTIVE" as const },
];

describe("Score Validation Unit Tests (validateScores)", () => {
  test("Rejects scores above part maximum", () => {
    const res = validateScores({
      rows: [
        { admission_number: "ADM-001", scores: { CA: 45, Exam: 50 } }, // CA max is 40
      ],
      scheme: DEFAULT_FALLBACK_SCHEME,
      students: mockStudents,
      isSubmission: false,
    });

    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errors.length, 1);
    assert.match(res.errors[0], /exceeds the maximum of 40/i);
  });

  test("Rejects negative scores", () => {
    const res = validateScores({
      rows: [
        { admission_number: "ADM-001", scores: { CA: -5, Exam: 50 } },
      ],
      scheme: DEFAULT_FALLBACK_SCHEME,
      students: mockStudents,
      isSubmission: false,
    });

    assert.strictEqual(res.valid, false);
    assert.match(res.errors[0], /Score cannot be negative/i);
  });

  test("Rejects duplicate admission numbers in input", () => {
    const res = validateScores({
      rows: [
        { admission_number: "ADM-001", scores: { CA: 30, Exam: 50 } },
        { admission_number: "ADM-001", scores: { CA: 25, Exam: 45 } },
      ],
      scheme: DEFAULT_FALLBACK_SCHEME,
      students: mockStudents,
      isSubmission: false,
    });

    assert.strictEqual(res.valid, false);
    assert.match(res.errors[0], /Duplicate student entry/i);
  });

  test("Rejects unknown students not enrolled in the class", () => {
    const res = validateScores({
      rows: [
        { admission_number: "ADM-UNKNOWN", scores: { CA: 30, Exam: 50 } },
      ],
      scheme: DEFAULT_FALLBACK_SCHEME,
      students: mockStudents,
      isSubmission: false,
    });

    assert.strictEqual(res.valid, false);
    assert.match(res.errors[0], /Unknown or unassigned student/i);
  });

  test("Submission mode rejects missing scores for active students", () => {
    const res = validateScores({
      rows: [
        { admission_number: "ADM-001", scores: { CA: 35, Exam: 55 } },
        // student-2 (ADM-002) is completely missing
      ],
      scheme: DEFAULT_FALLBACK_SCHEME,
      students: mockStudents,
      isSubmission: true,
    });

    assert.strictEqual(res.valid, false);
    assert.match(res.errors[0], /Missing score submission for student "Babajide Adeleke"/i);
  });

  test("Automatically calculates total, grade, and remark", () => {
    const res = validateScores({
      rows: [
        { admission_number: "ADM-001", scores: { CA: 35, Exam: 45 } }, // Total 80 -> A
        { admission_number: "ADM-002", scores: { CA: 20, Exam: 32 } }, // Total 52 -> C
      ],
      scheme: DEFAULT_FALLBACK_SCHEME,
      students: mockStudents,
      isSubmission: true,
    });

    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.validatedRows.length, 2);
    assert.strictEqual(res.validatedRows[0].total, 80);
    assert.strictEqual(res.validatedRows[0].grade, "A");
    assert.strictEqual(res.validatedRows[0].remark, "Excellent");

    assert.strictEqual(res.validatedRows[1].total, 52);
    assert.strictEqual(res.validatedRows[1].grade, "C");
    assert.strictEqual(res.validatedRows[1].remark, "Credit");
  });
});

describe("Score Entry Endpoints & Permissions (Isolated / Mocked DB)", () => {
  test("GET /api/staff/scores requires authentication (returns 401)", async () => {
    const req = createMockReq("http://localhost/api/staff/scores?classId=c1&subjectId=s1&termId=t1");
    const res = await getScores(req);
    assert.strictEqual(res.status, 401);
  });

  test("Teacher cannot view scores for unassigned subject/class (returns 403)", async () => {
    const teacherToken = await tokenFor("teacher", "school-1", "teacher-1");

    const origClassFind = prisma.class.findUnique;
    const origSubjFind = prisma.subject.findUnique;
    const origTermFind = prisma.term.findUnique;
    const origAssignFind = prisma.teacherAssignment.findFirst;

    (prisma.class as any).findUnique = async () => ({
      id: "class-1",
      name: "JSS 1A",
      school_id: "school-1",
      students: mockStudents,
    });
    (prisma.subject as any).findUnique = async () => ({
      id: "subj-1",
      name: "Mathematics",
      code: "MTH",
      school_id: "school-1",
    });
    (prisma.term as any).findUnique = async () => ({
      id: "term-1",
      session: "2026/2027",
      term_number: 1,
      status: "DRAFT",
      school_id: "school-1",
    });
    // Teacher not assigned
    (prisma.teacherAssignment as any).findFirst = async () => null;

    try {
      const req = createMockReq(
        "http://localhost/api/staff/scores?classId=class-1&subjectId=subj-1&termId=term-1",
        { token: teacherToken }
      );
      const res = await getScores(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /not assigned/i);
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.subject as any).findUnique = origSubjFind;
      (prisma.term as any).findUnique = origTermFind;
      (prisma.teacherAssignment as any).findFirst = origAssignFind;
    }
  });

  test("POST /api/staff/scores/save rejects score above maximum (returns 422)", async () => {
    const teacherToken = await tokenFor("teacher", "school-1", "teacher-1");

    const origClassFind = prisma.class.findUnique;
    const origSubjFind = prisma.subject.findUnique;
    const origTermFind = prisma.term.findUnique;
    const origAssignFind = prisma.teacherAssignment.findFirst;
    const origResultFind = prisma.result.findFirst;
    const origSchemesFind = (prisma.gradingScheme as any).findMany;

    (prisma.class as any).findUnique = async () => ({
      id: "class-1",
      name: "JSS 1A",
      school_id: "school-1",
      students: mockStudents,
    });
    (prisma.subject as any).findUnique = async () => ({
      id: "subj-1",
      school_id: "school-1",
    });
    (prisma.term as any).findUnique = async () => ({
      id: "term-1",
      school_id: "school-1",
      status: "DRAFT",
    });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: "assign-1" });
    (prisma.result as any).findFirst = async () => null; // not locked
    (prisma.gradingScheme as any).findMany = async () => [
      { id: "g1", school_id: "school-1", parts: DEFAULT_FALLBACK_SCHEME.parts, boundaries: DEFAULT_FALLBACK_SCHEME.boundaries },
    ];

    try {
      const req = createMockReq("http://localhost/api/staff/scores/save", {
        token: teacherToken,
        method: "POST",
        body: {
          classId: "class-1",
          subjectId: "subj-1",
          termId: "term-1",
          scores: [
            { admission_number: "ADM-001", scores: { CA: 50, Exam: 30 } }, // CA > 40
          ],
        },
      });
      const res = await saveScores(req);
      assert.strictEqual(res.status, 422);
      const data = await res.json();
      assert.match(data.details[0], /exceeds the maximum/i);
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.subject as any).findUnique = origSubjFind;
      (prisma.term as any).findUnique = origTermFind;
      (prisma.teacherAssignment as any).findFirst = origAssignFind;
      (prisma.result as any).findFirst = origResultFind;
      (prisma.gradingScheme as any).findMany = origSchemesFind;
    }
  });

  test("Submitted scores are locked: teacher edit/save returns 403", async () => {
    const teacherToken = await tokenFor("teacher", "school-1", "teacher-1");

    const origClassFind = prisma.class.findUnique;
    const origSubjFind = prisma.subject.findUnique;
    const origTermFind = prisma.term.findUnique;
    const origAssignFind = prisma.teacherAssignment.findFirst;
    const origResultFind = prisma.result.findFirst;

    (prisma.class as any).findUnique = async () => ({
      id: "class-1",
      name: "JSS 1A",
      school_id: "school-1",
      students: mockStudents,
    });
    (prisma.subject as any).findUnique = async () => ({
      id: "subj-1",
      school_id: "school-1",
    });
    (prisma.term as any).findUnique = async () => ({
      id: "term-1",
      school_id: "school-1",
      status: "DRAFT",
    });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: "assign-1" });
    // Already submitted and locked!
    (prisma.result as any).findFirst = async () => ({ id: "res-1", status: "SUBMITTED" });

    try {
      const req = createMockReq("http://localhost/api/staff/scores/save", {
        token: teacherToken,
        method: "POST",
        body: {
          classId: "class-1",
          subjectId: "subj-1",
          termId: "term-1",
          scores: [
            { admission_number: "ADM-001", scores: { CA: 30, Exam: 50 } },
          ],
        },
      });
      const res = await saveScores(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /Scores are locked/i);
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.subject as any).findUnique = origSubjFind;
      (prisma.term as any).findUnique = origTermFind;
      (prisma.teacherAssignment as any).findFirst = origAssignFind;
      (prisma.result as any).findFirst = origResultFind;
    }
  });

  test("POST /api/staff/scores/submit requires confirmation checkbox (returns 400)", async () => {
    const teacherToken = await tokenFor("teacher", "school-1", "teacher-1");

    const req = createMockReq("http://localhost/api/staff/scores/submit", {
      token: teacherToken,
      method: "POST",
      body: {
        classId: "class-1",
        subjectId: "subj-1",
        termId: "term-1",
        confirmed: false, // not ticked
        scores: [{ admission_number: "ADM-001", scores: { CA: 30, Exam: 50 } }],
      },
    });
    const res = await submitScores(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Confirmation required/i);
  });

  test("POST /api/staff/scores/submit successfully locks scores with status SUBMITTED", async () => {
    const teacherToken = await tokenFor("teacher", "school-1", "teacher-1");

    const origClassFind = prisma.class.findUnique;
    const origSubjFind = prisma.subject.findUnique;
    const origTermFind = prisma.term.findUnique;
    const origAssignFind = prisma.teacherAssignment.findFirst;
    const origResultFind = prisma.result.findFirst;
    const origSchemesFind = (prisma.gradingScheme as any).findMany;
    const origTx = prisma.$transaction;

    (prisma.class as any).findUnique = async () => ({
      id: "class-1",
      name: "JSS 1A",
      school_id: "school-1",
      students: mockStudents,
    });
    (prisma.subject as any).findUnique = async () => ({
      id: "subj-1",
      school_id: "school-1",
    });
    (prisma.term as any).findUnique = async () => ({
      id: "term-1",
      school_id: "school-1",
      status: "DRAFT",
    });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: "assign-1" });
    (prisma.result as any).findFirst = async () => null; // not locked yet
    (prisma.gradingScheme as any).findMany = async () => [
      { id: "g1", school_id: "school-1", parts: DEFAULT_FALLBACK_SCHEME.parts, boundaries: DEFAULT_FALLBACK_SCHEME.boundaries },
    ];

    let txOperationsCount = 0;
    (prisma as any).$transaction = async (ops: any[]) => {
      txOperationsCount = ops.length;
      return ops;
    };

    try {
      const req = createMockReq("http://localhost/api/staff/scores/submit", {
        token: teacherToken,
        method: "POST",
        body: {
          classId: "class-1",
          subjectId: "subj-1",
          termId: "term-1",
          confirmed: true,
          scores: [
            { admission_number: "ADM-001", scores: { CA: 35, Exam: 50 } },
            { admission_number: "ADM-002", scores: { CA: 28, Exam: 42 } },
          ],
        },
      });
      const res = await submitScores(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.status, "SUBMITTED");
      assert.strictEqual(data.count, 2);
      assert.strictEqual(txOperationsCount, 2);
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.subject as any).findUnique = origSubjFind;
      (prisma.term as any).findUnique = origTermFind;
      (prisma.teacherAssignment as any).findFirst = origAssignFind;
      (prisma.result as any).findFirst = origResultFind;
      (prisma.gradingScheme as any).findMany = origSchemesFind;
      (prisma as any).$transaction = origTx;
    }
  });

  test("Unlock permission check: Teacher cannot unlock submitted scores (returns 403)", async () => {
    const teacherToken = await tokenFor("teacher", "school-1", "teacher-1");

    const req = createMockReq("http://localhost/api/staff/scores/unlock", {
      token: teacherToken,
      method: "POST",
      body: {
        classId: "class-1",
        subjectId: "subj-1",
        termId: "term-1",
        reason: "Need to fix spelling of grade",
      },
    });
    const res = await unlockScores(req);
    assert.strictEqual(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /Only school administrators can unlock/i);
  });

  test("Unlock requires non-empty reason from school admin (returns 400)", async () => {
    const adminToken = await tokenFor("school_admin", "school-1", "admin-1");

    const req = createMockReq("http://localhost/api/staff/scores/unlock", {
      token: adminToken,
      method: "POST",
      body: {
        classId: "class-1",
        subjectId: "subj-1",
        termId: "term-1",
        reason: "   ", // whitespace only
      },
    });
    const res = await unlockScores(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /reason is required/i);
  });

  test("School admin unlocks scores with reason and creates AuditLog entry", async () => {
    const adminToken = await tokenFor("school_admin", "school-1", "admin-1");

    const origClassFind = prisma.class.findUnique;
    const origSubjFind = prisma.subject.findUnique;
    const origTermFind = prisma.term.findUnique;
    const origTx = prisma.$transaction;

    (prisma.class as any).findUnique = async () => ({
      id: "class-1",
      school_id: "school-1",
      students: [{ id: "student-1" }, { id: "student-2" }],
    });
    (prisma.subject as any).findUnique = async () => ({
      id: "subj-1",
      school_id: "school-1",
    });
    (prisma.term as any).findUnique = async () => ({
      id: "term-1",
      school_id: "school-1",
    });

    let auditLogCreated: any = null;
    let resultsUpdated = false;

    (prisma as any).$transaction = async (fn: any) => {
      const mockTx = {
        result: {
          updateMany: async (args: any) => {
            assert.strictEqual(args.data.status, "DRAFT");
            resultsUpdated = true;
            return { count: 2 };
          },
        },
        auditLog: {
          create: async (args: any) => {
            auditLogCreated = args.data;
            return { id: "log-1", ...args.data };
          },
        },
      };
      return fn(mockTx);
    };

    try {
      const req = createMockReq("http://localhost/api/staff/scores/unlock", {
        token: adminToken,
        method: "POST",
        body: {
          classId: "class-1",
          subjectId: "subj-1",
          termId: "term-1",
          reason: "Teacher requested correction of CA mark for student ADM-001",
        },
      });
      const res = await unlockScores(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.unlocked_count, 2);

      assert.strictEqual(resultsUpdated, true);
      assert.ok(auditLogCreated);
      assert.strictEqual(auditLogCreated.action, "RESULT_UNLOCK");
      assert.strictEqual(auditLogCreated.entity, "Result");
      assert.strictEqual(
        auditLogCreated.reason,
        "Teacher requested correction of CA mark for student ADM-001"
      );
      assert.strictEqual(auditLogCreated.school_id, "school-1");
      assert.strictEqual(auditLogCreated.user_id, "admin-1");
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.subject as any).findUnique = origSubjFind;
      (prisma.term as any).findUnique = origTermFind;
      (prisma as any).$transaction = origTx;
    }
  });

  test("POST /api/staff/scores/delete rejects deleting locked scores (returns 403)", async () => {
    const teacherToken = await tokenFor("teacher", "school-1", "teacher-1");

    const origClassFind = prisma.class.findUnique;
    const origSubjFind = prisma.subject.findUnique;
    const origTermFind = prisma.term.findUnique;
    const origAssignFind = prisma.teacherAssignment.findFirst;
    const origResultCount = prisma.result.count;

    (prisma.class as any).findUnique = async () => ({ id: "class-1", school_id: "school-1" });
    (prisma.subject as any).findUnique = async () => ({ id: "subj-1", school_id: "school-1" });
    (prisma.term as any).findUnique = async () => ({ id: "term-1", school_id: "school-1" });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: "assign-1" });
    // Already submitted
    (prisma.result as any).count = async () => 1;

    try {
      const req = createMockReq("http://localhost/api/staff/scores/delete", {
        token: teacherToken,
        method: "POST",
        body: {
          classId: "class-1",
          subjectId: "subj-1",
          termId: "term-1",
          studentIds: ["student-1"],
        },
      });
      const res = await deleteScores(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /Scores are locked/i);
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.subject as any).findUnique = origSubjFind;
      (prisma.term as any).findUnique = origTermFind;
      (prisma.teacherAssignment as any).findFirst = origAssignFind;
      (prisma.result as any).count = origResultCount;
    }
  });

  test("POST /api/staff/scores/delete successfully deletes draft records", async () => {
    const teacherToken = await tokenFor("teacher", "school-1", "teacher-1");

    const origClassFind = prisma.class.findUnique;
    const origSubjFind = prisma.subject.findUnique;
    const origTermFind = prisma.term.findUnique;
    const origAssignFind = prisma.teacherAssignment.findFirst;
    const origResultCount = prisma.result.count;
    const origResultDelete = prisma.result.deleteMany;

    (prisma.class as any).findUnique = async () => ({ id: "class-1", school_id: "school-1" });
    (prisma.subject as any).findUnique = async () => ({ id: "subj-1", school_id: "school-1" });
    (prisma.term as any).findUnique = async () => ({ id: "term-1", school_id: "school-1" });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: "assign-1" });
    (prisma.result as any).count = async () => 0; // no locked records
    let deletedArgs: any = null;
    (prisma.result as any).deleteMany = async (args: any) => {
      deletedArgs = args;
      return { count: 2 };
    };

    try {
      const req = createMockReq("http://localhost/api/staff/scores/delete", {
        token: teacherToken,
        method: "POST",
        body: {
          classId: "class-1",
          subjectId: "subj-1",
          termId: "term-1",
          studentIds: ["student-1", "student-2"],
        },
      });
      const res = await deleteScores(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.count, 2);
      assert.deepStrictEqual(deletedArgs.where.student_id, { in: ["student-1", "student-2"] });
      assert.strictEqual(deletedArgs.where.status, "DRAFT");
    } finally {
      (prisma.class as any).findUnique = origClassFind;
      (prisma.subject as any).findUnique = origSubjFind;
      (prisma.term as any).findUnique = origTermFind;
      (prisma.teacherAssignment as any).findFirst = origAssignFind;
      (prisma.result as any).count = origResultCount;
      (prisma.result as any).deleteMany = origResultDelete;
    }
  });
});
