import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as postAssignment } from "../src/app/api/admin/teachers/assignments/route.ts";
import { DELETE as deleteAssignment } from "../src/app/api/admin/teachers/assignments/[id]/route.ts";
import { POST as postDepartment, GET as getDepartments } from "../src/app/api/admin/departments/route.ts";
import { PATCH as patchDepartment } from "../src/app/api/admin/departments/[id]/route.ts";
import { PATCH as patchStudentDept } from "../src/app/api/admin/students/[id]/department/route.ts";
import { GET as getScores } from "../src/app/api/staff/scores/route.ts";
import { POST as saveScores } from "../src/app/api/staff/scores/save/route.ts";
import { POST as submitScores } from "../src/app/api/staff/scores/submit/route.ts";
import { POST as postRosterPreview } from "../src/app/api/admin/schools/[id]/roster/preview/route.ts";
import { POST as postRosterImport } from "../src/app/api/admin/schools/[id]/roster/import/route.ts";
import { ReportService } from "../src/modules/results/reportService.ts";
import {
  detectDepartmentAndClass,
  normalizeDepartmentName,
  validateRosterRows,
} from "../src/lib/roster/parseAndValidate.ts";
import { createSessionToken, SESSION_COOKIE_NAME } from "../src/lib/auth/session.ts";
import { prisma } from "../src/lib/prisma.ts";

function createMockReq(
  url: string,
  opts: {
    token?: string;
    method?: string;
    body?: any;
    formData?: FormData;
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
    method: opts.method ?? (opts.body || opts.formData ? "POST" : "GET"),
    headers,
    body: opts.formData ? (opts.formData as any) : opts.body ? JSON.stringify(opts.body) : undefined,
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

describe("Departments - Requirements & Security Tests", () => {
  // 1. Multi-department assignment creates one line per department & duplicate enforcement
  test("Multi-department assignment creates one line per department; all-department creates one line", async () => {
    const adminToken = await tokenFor("platform_admin");

    const origUser = prisma.user.findFirst;
    const origClass = prisma.class.findFirst;
    const origSubj = prisma.subject.findFirst;
    const origDeptFind = prisma.department.findMany;
    const origTx = prisma.$transaction;

    (prisma.user as any).findFirst = async () => ({ id: "t1", role: "teacher", school_id: "s1" });
    (prisma.class as any).findFirst = async () => ({ id: "c1", school_id: "s1" });
    (prisma.subject as any).findFirst = async () => ({ id: "sub1", name: "Biology", school_id: "s1" });
    (prisma.department as any).findMany = async () => [
      { id: "d1", name: "Science", school_id: "s1", departmentSubjects: [{ id: "ds1", subject_id: "sub1" }] },
      { id: "d2", name: "Arts", school_id: "s1", departmentSubjects: [{ id: "ds2", subject_id: "sub1" }] },
    ];

    let createdAssignments: any[] = [];
    (prisma as any).$transaction = async (fn: any) => {
      const mockTx = {
        teacherAssignment: {
          findMany: async () => [],
          create: async ({ data }: any) => {
            createdAssignments.push(data);
            return { id: `assign-${createdAssignments.length}`, ...data };
          },
        },
      };
      return fn(mockTx);
    };

    try {
      const req = createMockReq("http://localhost/api/admin/teachers/assignments", {
        token: adminToken,
        method: "POST",
        body: {
          school_id: "s1",
          teacher_id: "t1",
          class_id: "c1",
          subject_id: "sub1",
          department_ids: ["d1", "d2"],
        },
      });

      const res = await postAssignment(req);
      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.assignments.length, 2);
      assert.strictEqual(createdAssignments.length, 2);
      assert.strictEqual(createdAssignments[0].department_id, "d1");
      assert.strictEqual(createdAssignments[1].department_id, "d2");
    } finally {
      (prisma.user as any).findFirst = origUser;
      (prisma.class as any).findFirst = origClass;
      (prisma.subject as any).findFirst = origSubj;
      (prisma.department as any).findMany = origDeptFind;
      (prisma as any).$transaction = origTx;
    }
  });

  test("Enforces one all-departments assignment per teacher, class and subject (no duplicate lines created)", async () => {
    const adminToken = await tokenFor("platform_admin");

    const origUser = prisma.user.findFirst;
    const origClass = prisma.class.findFirst;
    const origSubj = prisma.subject.findFirst;
    const origTx = prisma.$transaction;

    (prisma.user as any).findFirst = async () => ({ id: "t1", role: "teacher", school_id: "s1" });
    (prisma.class as any).findFirst = async () => ({ id: "c1", school_id: "s1" });
    (prisma.subject as any).findFirst = async () => ({ id: "sub1", name: "Math", school_id: "s1" });

    let createCallCount = 0;
    (prisma as any).$transaction = async (fn: any) => {
      const mockTx = {
        teacherAssignment: {
          // Already has an all-departments assignment
          findMany: async () => [
            { id: "assign-all-1", school_id: "s1", teacher_id: "t1", class_id: "c1", subject_id: "sub1", department_id: null },
          ],
          create: async ({ data }: any) => {
            createCallCount++;
            return { id: "assign-new", ...data };
          },
        },
      };
      return fn(mockTx);
    };

    try {
      const req = createMockReq("http://localhost/api/admin/teachers/assignments", {
        token: adminToken,
        method: "POST",
        body: {
          school_id: "s1",
          teacher_id: "t1",
          class_id: "c1",
          subject_id: "sub1",
          all_departments: true,
        },
      });

      const res = await postAssignment(req);
      assert.strictEqual(res.status, 201);
      // create was NOT called because all-departments already exists
      assert.strictEqual(createCallCount, 0);
    } finally {
      (prisma.user as any).findFirst = origUser;
      (prisma.class as any).findFirst = origClass;
      (prisma.subject as any).findFirst = origSubj;
      (prisma as any).$transaction = origTx;
    }
  });

  // 2. Reject subject not offered by department
  test("Reject subject that the chosen department does not offer (server-side 400)", async () => {
    const adminToken = await tokenFor("platform_admin");

    const origUser = prisma.user.findFirst;
    const origClass = prisma.class.findFirst;
    const origSubj = prisma.subject.findFirst;
    const origDeptFind = prisma.department.findMany;

    (prisma.user as any).findFirst = async () => ({ id: "t1", role: "teacher", school_id: "s1" });
    (prisma.class as any).findFirst = async () => ({ id: "c1", school_id: "s1" });
    (prisma.subject as any).findFirst = async () => ({ id: "sub-physics", name: "Physics", school_id: "s1" });
    // Commercial department does NOT offer Physics
    (prisma.department as any).findMany = async () => [
      { id: "d-comm", name: "Commercial", school_id: "s1", departmentSubjects: [] },
    ];

    try {
      const req = createMockReq("http://localhost/api/admin/teachers/assignments", {
        token: adminToken,
        method: "POST",
        body: {
          school_id: "s1",
          teacher_id: "t1",
          class_id: "c1",
          subject_id: "sub-physics",
          department_ids: ["d-comm"],
        },
      });

      const res = await postAssignment(req);
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.match(data.error, /does not offer subject/i);
    } finally {
      (prisma.user as any).findFirst = origUser;
      (prisma.class as any).findFirst = origClass;
      (prisma.subject as any).findFirst = origSubj;
      (prisma.department as any).findMany = origDeptFind;
    }
  });

  // 3. Teacher sees only their departments' students & cannot see/write another department's students
  test("Teacher score grid shows only students of teacher's assigned department whose department offers the subject", async () => {
    const teacherToken = await tokenFor("teacher", "s1", "t1");

    const origClass = prisma.class.findUnique;
    const origSubj = prisma.subject.findUnique;
    const origTerm = prisma.term.findUnique;
    const origAssign = prisma.teacherAssignment.findFirst;
    const origAssignMany = prisma.teacherAssignment.findMany;
    const origDeptSubj = prisma.departmentSubject.findMany;
    const origScheme = prisma.gradingScheme.findMany;
    const origResult = prisma.result.findMany;

    (prisma.class as any).findUnique = async () => ({
      id: "c1",
      name: "SS 2",
      school_id: "s1",
      students: [
        { id: "s-sci", admission_number: "001", full_name: "Science Student", department_id: "dept-sci", status: "ACTIVE" },
        { id: "s-art", admission_number: "002", full_name: "Arts Student", department_id: "dept-art", status: "ACTIVE" },
        { id: "s-none", admission_number: "003", full_name: "No Dept Student", department_id: null, status: "ACTIVE" },
      ],
    });

    (prisma.subject as any).findUnique = async () => ({ id: "sub-chem", name: "Chemistry", code: "CHM", school_id: "s1" });
    (prisma.term as any).findUnique = async () => ({ id: "term-1", session: "2026/2027", term_number: 1, status: "DRAFT", school_id: "s1" });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: "a1" });

    // Teacher t1 is assigned only to dept-sci
    (prisma.teacherAssignment as any).findMany = async () => [
      { id: "a1", department_id: "dept-sci" },
    ];

    // Chemistry is offered only by dept-sci
    (prisma.departmentSubject as any).findMany = async () => [
      { department_id: "dept-sci" },
    ];

    (prisma.gradingScheme as any).findMany = async () => [];
    (prisma.result as any).findMany = async () => [];

    try {
      const req = createMockReq("http://localhost/api/staff/scores?classId=c1&subjectId=sub-chem&termId=term-1", {
        token: teacherToken,
      });

      const res = await getScores(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      // Only s-sci (matching department offering Chemistry) and s-none (student with no department) appear!
      const studentIds = data.students.map((s: any) => s.id);
      assert.ok(studentIds.includes("s-sci"));
      assert.ok(studentIds.includes("s-none"));
      assert.ok(!studentIds.includes("s-art"), "Arts student should NOT appear for Science Chemistry assignment");
    } finally {
      (prisma.class as any).findUnique = origClass;
      (prisma.subject as any).findUnique = origSubj;
      (prisma.term as any).findUnique = origTerm;
      (prisma.teacherAssignment as any).findFirst = origAssign;
      (prisma.teacherAssignment as any).findMany = origAssignMany;
      (prisma.departmentSubject as any).findMany = origDeptSubj;
      (prisma.gradingScheme as any).findMany = origScheme;
      (prisma.result as any).findMany = origResult;
    }
  });

  test("Teacher cannot save scores for student of another department (403)", async () => {
    const teacherToken = await tokenFor("teacher", "s1", "t1");

    const origClass = prisma.class.findUnique;
    const origSubj = prisma.subject.findUnique;
    const origTerm = prisma.term.findUnique;
    const origAssign = prisma.teacherAssignment.findFirst;
    const origAssignMany = prisma.teacherAssignment.findMany;
    const origStudent = prisma.student.findUnique;
    const origScheme = prisma.gradingScheme.findMany;
    const origResultFirst = prisma.result.findFirst;

    (prisma.class as any).findUnique = async () => ({
      id: "c1",
      name: "SS 2",
      school_id: "s1",
      students: [
        { id: "s-art", admission_number: "ADM-ART", full_name: "Arts Student", department_id: "dept-art", status: "ACTIVE" },
      ],
    });
    (prisma.subject as any).findUnique = async () => ({ id: "sub-chem", school_id: "s1" });
    (prisma.term as any).findUnique = async () => ({ id: "term-1", school_id: "s1", status: "DRAFT" });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: "a1" });
    (prisma.result as any).findFirst = async () => null;

    // Student belongs to Arts
    (prisma.student as any).findUnique = async () => ({
      id: "s-art",
      school_id: "s1",
      class_id: "c1",
      department_id: "dept-art",
    });

    // Teacher only assigned to Science
    (prisma.teacherAssignment as any).findMany = async () => [
      { id: "a1", department_id: "dept-sci" },
    ];

    (prisma.gradingScheme as any).findMany = async () => [];

    try {
      const req = createMockReq("http://localhost/api/staff/scores/save", {
        token: teacherToken,
        method: "POST",
        body: {
          classId: "c1",
          subjectId: "sub-chem",
          termId: "term-1",
          scores: [
            { student_id: "s-art", admission_number: "ADM-ART", scores: { CA: 20, Exam: 40 } },
          ],
        },
      });

      const res = await saveScores(req);
      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.match(data.error, /Access denied/i);
    } finally {
      (prisma.class as any).findUnique = origClass;
      (prisma.subject as any).findUnique = origSubj;
      (prisma.term as any).findUnique = origTerm;
      (prisma.teacherAssignment as any).findFirst = origAssign;
      (prisma.teacherAssignment as any).findMany = origAssignMany;
      (prisma.student as any).findUnique = origStudent;
      (prisma.gradingScheme as any).findMany = origScheme;
      (prisma.result as any).findFirst = origResultFirst;
    }
  });

  // 4. Null department assignment covers all students whose department offers the subject + students with no department
  test("An assignment with department null means all departments: covers all students whose dept offers the subject", async () => {
    const teacherToken = await tokenFor("teacher", "s1", "t1");

    const origClass = prisma.class.findUnique;
    const origSubj = prisma.subject.findUnique;
    const origTerm = prisma.term.findUnique;
    const origAssign = prisma.teacherAssignment.findFirst;
    const origAssignMany = prisma.teacherAssignment.findMany;
    const origDeptSubj = prisma.departmentSubject.findMany;
    const origScheme = prisma.gradingScheme.findMany;
    const origResult = prisma.result.findMany;

    (prisma.class as any).findUnique = async () => ({
      id: "c1",
      name: "SS 2",
      school_id: "s1",
      students: [
        { id: "s1", admission_number: "001", full_name: "Science Student", department_id: "d-sci", status: "ACTIVE" },
        { id: "s2", admission_number: "002", full_name: "Arts Student", department_id: "d-art", status: "ACTIVE" },
        { id: "s3", admission_number: "003", full_name: "Commercial Student", department_id: "d-comm", status: "ACTIVE" },
        { id: "s4", admission_number: "004", full_name: "No Dept Student", department_id: null, status: "ACTIVE" },
      ],
    });

    (prisma.subject as any).findUnique = async () => ({ id: "sub-math", name: "Mathematics", code: "MTH", school_id: "s1" });
    (prisma.term as any).findUnique = async () => ({ id: "term-1", session: "2026/2027", term_number: 1, status: "DRAFT", school_id: "s1" });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: "a-all" });

    // Teacher assignment is null (All departments)
    (prisma.teacherAssignment as any).findMany = async () => [
      { id: "a-all", department_id: null },
    ];

    // Math is offered by Science and Commercial, but NOT by Arts
    (prisma.departmentSubject as any).findMany = async () => [
      { department_id: "d-sci" },
      { department_id: "d-comm" },
    ];

    (prisma.gradingScheme as any).findMany = async () => [];
    (prisma.result as any).findMany = async () => [];

    try {
      const req = createMockReq("http://localhost/api/staff/scores?classId=c1&subjectId=sub-math&termId=term-1", {
        token: teacherToken,
      });

      const res = await getScores(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();

      const studentIds = data.students.map((s: any) => s.id);
      assert.ok(studentIds.includes("s1"), "Science student should appear");
      assert.ok(studentIds.includes("s3"), "Commercial student should appear");
      assert.ok(studentIds.includes("s4"), "No-dept student should appear");
      assert.ok(!studentIds.includes("s2"), "Arts student should NOT appear because Arts does not offer Math");
    } finally {
      (prisma.class as any).findUnique = origClass;
      (prisma.subject as any).findUnique = origSubj;
      (prisma.term as any).findUnique = origTerm;
      (prisma.teacherAssignment as any).findFirst = origAssign;
      (prisma.teacherAssignment as any).findMany = origAssignMany;
      (prisma.departmentSubject as any).findMany = origDeptSubj;
      (prisma.gradingScheme as any).findMany = origScheme;
      (prisma.result as any).findMany = origResult;
    }
  });

  // 5. Read-only review after submission
  test("After submission teacher can still open assignment to review scores, and isLocked is true", async () => {
    const teacherToken = await tokenFor("teacher", "s1", "t1");

    const origClass = prisma.class.findUnique;
    const origSubj = prisma.subject.findUnique;
    const origTerm = prisma.term.findUnique;
    const origAssign = prisma.teacherAssignment.findFirst;
    const origAssignMany = prisma.teacherAssignment.findMany;
    const origDeptSubj = prisma.departmentSubject.findMany;
    const origScheme = prisma.gradingScheme.findMany;
    const origResult = prisma.result.findMany;

    (prisma.class as any).findUnique = async () => ({
      id: "c1",
      name: "SS 1",
      school_id: "s1",
      students: [{ id: "stu-1", admission_number: "001", full_name: "Student", department_id: null, status: "ACTIVE" }],
    });
    (prisma.subject as any).findUnique = async () => ({ id: "sub-1", name: "English", school_id: "s1" });
    (prisma.term as any).findUnique = async () => ({ id: "term-1", session: "2026/2027", term_number: 1, status: "DRAFT", school_id: "s1" });
    (prisma.teacherAssignment as any).findFirst = async () => ({ id: "a1" });
    (prisma.teacherAssignment as any).findMany = async () => [{ id: "a1", department_id: null }];
    (prisma.departmentSubject as any).findMany = async () => [];
    (prisma.gradingScheme as any).findMany = async () => [];

    // Submitted scores exist
    (prisma.result as any).findMany = async () => [
      {
        id: "res-1",
        student_id: "stu-1",
        ca_score: 35,
        exam_score: 55,
        total: 90,
        grade: "A",
        remark: "Excellent",
        status: "SUBMITTED",
        updated_at: new Date(),
      },
    ];

    try {
      const req = createMockReq("http://localhost/api/staff/scores?classId=c1&subjectId=sub-1&termId=term-1", {
        token: teacherToken,
      });

      const res = await getScores(req);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.isLocked, true);
      assert.strictEqual(data.results.length, 1);
      assert.strictEqual(data.results[0].status, "SUBMITTED");
    } finally {
      (prisma.class as any).findUnique = origClass;
      (prisma.subject as any).findUnique = origSubj;
      (prisma.term as any).findUnique = origTerm;
      (prisma.teacherAssignment as any).findFirst = origAssign;
      (prisma.teacherAssignment as any).findMany = origAssignMany;
      (prisma.departmentSubject as any).findMany = origDeptSubj;
      (prisma.gradingScheme as any).findMany = origScheme;
      (prisma.result as any).findMany = origResult;
    }
  });

  // 6. Roster upload department normalization & detection (3 sources) & warnings for SS2/SS3
  test("Department detection order: (1) column, (2) class value, (3) none, with name normalisation", () => {
    // 1. Column detection
    const colRes = detectDepartmentAndClass("SS 2A", "Sci");
    assert.strictEqual(colRes.className, "SS 2A");
    assert.strictEqual(colRes.departmentName, "Science");
    assert.strictEqual(colRes.departmentSource, "COLUMN");

    // 2. Class value detection
    const classValRes = detectDepartmentAndClass("SS2 Commercial B");
    assert.strictEqual(classValRes.className, "SS2 B");
    assert.strictEqual(classValRes.departmentName, "Commercial");
    assert.strictEqual(classValRes.departmentSource, "CLASS_VALUE");

    // 3. None
    const noneRes = detectDepartmentAndClass("JSS 1A");
    assert.strictEqual(noneRes.className, "JSS 1A");
    assert.strictEqual(noneRes.departmentName, null);
    assert.strictEqual(noneRes.departmentSource, "NONE");

    // Common short forms normalisation
    assert.strictEqual(normalizeDepartmentName("sci"), "Science");
    assert.strictEqual(normalizeDepartmentName("Art"), "Arts");
    assert.strictEqual(normalizeDepartmentName("Business"), "Commercial");
    assert.strictEqual(normalizeDepartmentName("comm"), "Commercial");
  });

  test("Roster validation warns for SS2 and SS3 students with no department, but JSS gets no warning", () => {
    const rawRows = [
      { rowNumber: 2, admission_number: "001", full_name: "JSS Student", class_name: "JSS 1" },
      { rowNumber: 3, admission_number: "002", full_name: "SS2 Student", class_name: "SS 2" },
      { rowNumber: 4, admission_number: "003", full_name: "SS3 Student", class_name: "SS 3" },
    ];

    const result = validateRosterRows(rawRows, [], ["JSS 1", "SS 2", "SS 3"], ["Science", "Arts"]);

    assert.strictEqual(result.errorCount, 0);
    // Warnings for SS2 and SS3, but NOT for JSS 1
    assert.strictEqual(result.warnings.filter((w) => w.includes("has no department assigned")).length, 2);
  });

  test("Department change from old to new is listed in preview and requires confirmation", () => {
    const existing = [
      {
        admission_number: "ADM-001",
        full_name: "Musa Danladi",
        class_name: "SS 2",
        department_name: "Science",
        submittedSubjects: ["Physics", "Chemistry"],
      },
    ];

    const rawRows = [
      { rowNumber: 2, admission_number: "ADM-001", full_name: "Musa Danladi", class_name: "SS 2", department_name: "Arts" },
    ];

    const deptSubjectsMap = new Map<string, Set<string>>([
      ["science", new Set(["physics", "chemistry", "english"])],
      ["arts", new Set(["literature", "government", "english"])],
    ]);

    const result = validateRosterRows(rawRows, existing, ["SS 2"], ["Science", "Arts"], deptSubjectsMap);

    assert.strictEqual(result.requiresDepartmentConfirmation, true);
    assert.strictEqual(result.departmentChanges.length, 1);
    assert.strictEqual(result.departmentChanges[0].from, "Science");
    assert.strictEqual(result.departmentChanges[0].to, "Arts");
    // Physics and Chemistry are affected (not offered by Arts)
    assert.ok(result.departmentChanges[0].affectedSubjects.includes("Physics"));
    assert.ok(result.departmentChanges[0].affectedSubjects.includes("Chemistry"));
  });

  // 7. Report card & average include only department subjects
  test("Report card and average include only department subjects; untouched results for unoffered subjects are omitted", async () => {
    const origStudentFind = prisma.student.findUnique;
    const origResultFind = prisma.result.findMany;

    // Student switched to Commercial
    (prisma.student as any).findUnique = async () => ({
      id: "student-1",
      department_id: "dept-comm",
      department: {
        id: "dept-comm",
        name: "Commercial",
        departmentSubjects: [
          { subject_id: "sub-accounting" },
          { subject_id: "sub-english" },
        ],
      },
    });

    // Student has 3 submitted results (including Physics from earlier Science department)
    (prisma.result as any).findMany = async () => [
      {
        subject: { id: "sub-accounting", name: "Accounting", code: "ACC" },
        ca_score: 30,
        exam_score: 50,
        total: 80,
        grade: "A",
        remark: "Excellent",
      },
      {
        subject: { id: "sub-english", name: "English", code: "ENG" },
        ca_score: 25,
        exam_score: 45,
        total: 70,
        grade: "A",
        remark: "Very Good",
      },
      {
        subject: { id: "sub-physics", name: "Physics", code: "PHY" },
        ca_score: 10,
        exam_score: 20,
        total: 30,
        grade: "F",
        remark: "Fail",
      },
    ];

    try {
      const report = await ReportService.getStudentTermReport("s1", "student-1", "term-1");
      // Physics should be filtered out!
      assert.strictEqual(report.length, 2);
      const subjectNames = report.map((r: any) => r.subject);
      assert.ok(subjectNames.includes("Accounting"));
      assert.ok(subjectNames.includes("English"));
      assert.ok(!subjectNames.includes("Physics"));
    } finally {
      (prisma.student as any).findUnique = origStudentFind;
      (prisma.result as any).findMany = origResultFind;
    }
  });

  // 8. Department changes by school admin or teacher return 403
  test("Department create/edit/delete by school admin or teacher returns 403 Forbidden", async () => {
    const teacherToken = await tokenFor("teacher", "s1");
    const schoolAdminToken = await tokenFor("school_admin", "s1");

    // POST /api/admin/departments
    const postReqTeacher = createMockReq("http://localhost/api/admin/departments", {
      token: teacherToken,
      method: "POST",
      body: { school_id: "s1", name: "Music" },
    });
    const resPostTeacher = await postDepartment(postReqTeacher);
    assert.strictEqual(resPostTeacher.status, 403);

    const postReqAdmin = createMockReq("http://localhost/api/admin/departments", {
      token: schoolAdminToken,
      method: "POST",
      body: { school_id: "s1", name: "Music" },
    });
    const resPostAdmin = await postDepartment(postReqAdmin);
    assert.strictEqual(resPostAdmin.status, 403);

    // PATCH /api/admin/departments/d1
    const patchReqAdmin = createMockReq("http://localhost/api/admin/departments/d1", {
      token: schoolAdminToken,
      method: "PATCH",
      body: { name: "Music Renamed" },
    });
    const resPatchAdmin = await patchDepartment(patchReqAdmin, { params: Promise.resolve({ id: "d1" }) });
    assert.strictEqual(resPatchAdmin.status, 403);

    // PATCH /api/admin/students/stu-1/department
    const patchStudentReq = createMockReq("http://localhost/api/admin/students/stu-1/department", {
      token: schoolAdminToken,
      method: "PATCH",
      body: { department_id: "d1" },
    });
    const resPatchStudent = await patchStudentDept(patchStudentReq, { params: Promise.resolve({ id: "stu-1" }) });
    assert.strictEqual(resPatchStudent.status, 403);

    // DELETE /api/admin/teachers/assignments/a1
    const deleteReqAdmin = createMockReq("http://localhost/api/admin/teachers/assignments/a1", {
      token: schoolAdminToken,
      method: "DELETE",
    });
    const resDeleteAdmin = await deleteAssignment(deleteReqAdmin, { params: Promise.resolve({ id: "a1" }) });
    assert.strictEqual(resDeleteAdmin.status, 403);
  });
});
