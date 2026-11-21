import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, verifyTeacherAssignment, AuthError } from "@/lib/auth/scope";
import { DEFAULT_FALLBACK_SCHEME } from "@/lib/scores/validateScores";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);

    if (!session.school_id) {
      return NextResponse.json(
        { error: "User is not associated with any school." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const classId = searchParams.get("classId");
    const subjectId = searchParams.get("subjectId");
    const termId = searchParams.get("termId");

    if (!classId || !subjectId || !termId) {
      return NextResponse.json(
        { error: "classId, subjectId, and termId parameters are required." },
        { status: 400 }
      );
    }

    // 1. Verify Class & Tenant Isolation
    const classObj = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            admission_number: true,
            full_name: true,
            department_id: true,
            status: true,
            department: {
              select: { id: true, name: true },
            },
          },
          orderBy: { admission_number: "asc" },
        },
      },
    });

    if (!classObj || classObj.school_id !== session.school_id) {
      return NextResponse.json({ error: "Class not found." }, { status: 404 });
    }

    // 2. Verify Subject
    const subjectObj = await prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, name: true, code: true, school_id: true },
    });

    if (!subjectObj || subjectObj.school_id !== session.school_id) {
      return NextResponse.json({ error: "Subject not found." }, { status: 404 });
    }

    // 3. Verify Term
    const termObj = await prisma.term.findUnique({
      where: { id: termId },
      select: { id: true, session: true, term_number: true, status: true, school_id: true },
    });

    if (!termObj || termObj.school_id !== session.school_id) {
      return NextResponse.json({ error: "Term not found." }, { status: 404 });
    }

    // 4. Role Authorization: Teacher check & fetch teacher assignments
    let teacherAssignments: { id: string; department_id: string | null }[] = [];
    if (session.role === "teacher") {
      await verifyTeacherAssignment(session.id, session.school_id, classId, subjectId);
      teacherAssignments = await prisma.teacherAssignment.findMany({
        where: {
          school_id: session.school_id,
          teacher_id: session.id,
          class_id: classId,
          subject_id: subjectId,
        },
        select: { id: true, department_id: true },
      });
    } else if (session.role !== "school_admin" && session.role !== "platform_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Grading Scheme Resolution
    const schemes = await prisma.gradingScheme.findMany({
      where: { school_id: session.school_id },
      orderBy: { created_at: "desc" },
    });

    const matchedScheme =
      schemes.find((s) => s.class_level && classObj.name.includes(s.class_level)) ||
      schemes.find((s) => !s.class_level) ||
      schemes[0];

    const gradingScheme = matchedScheme
      ? {
          id: matchedScheme.id,
          name: matchedScheme.name,
          parts: matchedScheme.parts as any,
          boundaries: matchedScheme.boundaries as any,
        }
      : DEFAULT_FALLBACK_SCHEME;

    // 6. Filter students based on teacher assignment & department offers
    // Fetch departments offering this subject in this school
    const deptSubjects = await prisma.departmentSubject.findMany({
      where: {
        school_id: session.school_id,
        subject_id: subjectId,
      },
      select: { department_id: true },
    });
    const offeringDeptIds = new Set(deptSubjects.map((ds) => ds.department_id));

    const isTeacher = session.role === "teacher";
    const hasAllDepts = !isTeacher || teacherAssignments.some((a) => a.department_id === null);
    const assignedDeptIds = new Set(teacherAssignments.map((a) => a.department_id).filter(Boolean) as string[]);

    const filteredStudents = classObj.students.filter((student) => {
      // If student has no department, they always appear
      if (!student.department_id) {
        return true;
      }

      // If student has a department, it MUST offer the subject
      if (!offeringDeptIds.has(student.department_id)) {
        return false;
      }

      // If viewing user is a teacher, assignment must cover student's department or all departments
      if (isTeacher) {
        if (!hasAllDepts && !assignedDeptIds.has(student.department_id)) {
          return false;
        }
      }

      return true;
    });

    // 7. Existing Results for filtered students
    const studentIds = filteredStudents.map((s) => s.id);
    const existingResults = await prisma.result.findMany({
      where: {
        school_id: session.school_id,
        subject_id: subjectId,
        term_id: termId,
        student_id: { in: studentIds },
      },
      select: {
        id: true,
        student_id: true,
        ca_score: true,
        exam_score: true,
        total: true,
        grade: true,
        remark: true,
        status: true,
        updated_at: true,
      },
    });

    const isLocked =
      existingResults.length > 0 &&
      existingResults.some((r) => r.status === "SUBMITTED");

    const formattedResults = existingResults.map((r) => ({
      id: r.id,
      student_id: r.student_id,
      ca_score: r.ca_score !== null && r.ca_score !== undefined ? Number(r.ca_score) : null,
      exam_score: r.exam_score !== null && r.exam_score !== undefined ? Number(r.exam_score) : null,
      total: r.total !== null && r.total !== undefined ? Number(r.total) : null,
      grade: r.grade,
      remark: r.remark,
      status: r.status,
      updated_at: r.updated_at,
    }));

    return NextResponse.json({
      class: { id: classObj.id, name: classObj.name },
      subject: subjectObj,
      term: {
        id: termObj.id,
        session: termObj.session,
        term_number: termObj.term_number,
        status: termObj.status,
        name: `Term ${termObj.term_number} (${termObj.session})`,
        is_open: termObj.status === "DRAFT",
      },
      scheme: gradingScheme,
      students: filteredStudents,
      results: formattedResults,
      isLocked,
      userRole: session.role,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error("[api/staff/scores] Error:", error);
    return NextResponse.json({ error: "Failed to fetch scores." }, { status: 500 });
  }
}
