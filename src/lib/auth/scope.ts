import { getSession, SessionUser } from './session';
import { prisma } from '../prisma';
import type { NextRequest } from 'next/server';

export class AuthError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = 'AuthError';
    this.statusCode = statusCode;
  }
}

/**
 * Ensures the user has an active authenticated session.
 * Throws 401 if unauthenticated.
 */
export async function requireAuth(providedSession?: SessionUser | null, request?: NextRequest): Promise<SessionUser> {
  const session = providedSession !== undefined ? providedSession : await getSession(request);
  if (!session) {
    throw new AuthError('Authentication required to access this resource.', 401);
  }
  return session;
}

/**
 * Ensures the authenticated user is a platform administrator.
 * Denies access with 403 for all other roles or tenants.
 */
export async function requirePlatformAdmin(providedSession?: SessionUser | null, request?: NextRequest): Promise<SessionUser> {
  const session = await requireAuth(providedSession, request);
  if (session.role !== 'platform_admin') {
    throw new AuthError('Platform administrator privileges required.', 403);
  }
  return session;
}

/**
 * Ensures the authenticated user is a school administrator for the specified school.
 * Throws 403 if role is invalid or tenant mismatch occurs.
 */
export async function requireSchoolAdmin(
  expectedSchoolId?: string,
  providedSession?: SessionUser | null
): Promise<SessionUser> {
  const session = await requireAuth(providedSession);
  if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
    throw new AuthError('School administrator privileges required.', 403);
  }

  if (session.role === 'school_admin' && expectedSchoolId && session.school_id !== expectedSchoolId) {
    throw new AuthError('Cross-tenant violation: You cannot access another school.', 403);
  }

  return session;
}

/**
 * Ensures the authenticated user is a teacher.
 * Throws 403 for non-teacher accounts.
 */
export async function requireTeacher(providedSession?: SessionUser | null): Promise<SessionUser> {
  const session = await requireAuth(providedSession);
  if (session.role !== 'teacher') {
    throw new AuthError('Teacher privileges required.', 403);
  }
  return session;
}

/**
 * Enforces cross-tenant isolation.
 * Prohibits School A from reading or modifying School B's data.
 * Throws 403 Forbidden on tenant boundary violation.
 */
export function requireSchoolAccess(user: SessionUser, targetSchoolId: string): void {
  if (user.role === 'platform_admin') {
    return; // Platform admin has cross-tenant oversight
  }

  if (!user.school_id || user.school_id !== targetSchoolId) {
    throw new AuthError('Cross-tenant access forbidden: Cannot access or modify data belonging to another school.', 403);
  }
}

/**
 * Explicit rule enforcement: Only platform_admin can create teachers or assignments.
 * school_admin cannot create teachers or assignments.
 */
export function assertCanCreateTeacher(user: SessionUser): void {
  if (user.role !== 'platform_admin') {
    throw new AuthError('School administrators cannot create teachers or assignments. Only platform administrators may perform this action.', 403);
  }
}

/**
 * Enforces teacher class restrictions.
 * Verifies that a teacher is explicitly assigned to the requested class.
 * Throws 403 Forbidden if not assigned.
 */
export async function verifyTeacherClassAccess(
  teacherId: string,
  schoolId: string,
  classId: string
): Promise<boolean> {
  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      school_id: schoolId,
      teacher_id: teacherId,
      class_id: classId,
    },
    select: { id: true },
  });

  if (!assignment) {
    throw new AuthError('Access denied: You are not assigned to this class.', 403);
  }

  return true;
}

/**
 * Enforces teacher class and subject assignment restrictions.
 * Verifies that a teacher is explicitly assigned to the requested class and subject.
 * Throws 403 Forbidden if not assigned.
 */
export async function verifyTeacherAssignment(
  teacherId: string,
  schoolId: string,
  classId: string,
  subjectId: string
): Promise<boolean> {
  const assignment = await prisma.teacherAssignment.findFirst({
    where: {
      school_id: schoolId,
      teacher_id: teacherId,
      class_id: classId,
      subject_id: subjectId,
    },
    select: { id: true },
  });

  if (!assignment) {
    throw new AuthError('Access denied: You are not assigned to this subject in this class.', 403);
  }

  return true;
}

/**
 * Verifies whether a student is eligible for a score entry/update by a teacher.
 * Rules:
 * 1. Student must belong to the specified class and school.
 * 2. Teacher must have an assignment for (school, teacher, class, subject) with either:
 *    - null department (all departments)
 *    - the student's department_id
 * 3. If student has a department:
 *    - If assignment specifies a department, student's department must match it.
 *    - The department MUST offer the subject via DepartmentSubject.
 *    If department doesn't offer subject or doesn't match teacher assignment, access is DENIED (403).
 * 4. If student has no department (null):
 *    - Student appears and is writeable under any assignment covering the class & subject.
 */
export async function verifyTeacherStudentScoreAccess(
  teacherId: string,
  schoolId: string,
  classId: string,
  subjectId: string,
  studentId: string
): Promise<boolean> {
  // Fetch student
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { id: true, school_id: true, class_id: true, department_id: true },
  });

  if (!student) {
    throw new AuthError('Student not found.', 404);
  }

  if (student.school_id !== schoolId) {
    throw new AuthError('Student not found in this school.', 404);
  }

  if (student.class_id !== classId) {
    throw new AuthError('Student does not belong to this class.', 403);
  }

  // Fetch teacher assignments for this class and subject
  const assignments = await prisma.teacherAssignment.findMany({
    where: {
      school_id: schoolId,
      teacher_id: teacherId,
      class_id: classId,
      subject_id: subjectId,
    },
    select: { id: true, department_id: true },
  });

  if (assignments.length === 0) {
    throw new AuthError('Access denied: You are not assigned to this subject in this class.', 403);
  }

  const hasAllDept = assignments.some((a) => a.department_id === null);
  const assignedDeptIds = new Set(assignments.map((a) => a.department_id).filter(Boolean) as string[]);

  if (student.department_id) {
    // Student has a department
    // Check if teacher is assigned to this department or all departments
    if (!hasAllDept && !assignedDeptIds.has(student.department_id)) {
      throw new AuthError('Access denied: You are not assigned to this student\'s department.', 403);
    }

    // Check if student's department offers the subject
    const deptSubject = await prisma.departmentSubject.findUnique({
      where: {
        department_id_subject_id: {
          department_id: student.department_id,
          subject_id: subjectId,
        },
      },
    });

    if (!deptSubject) {
      throw new AuthError('Access denied: Subject is not offered by student\'s department.', 403);
    }
  }

  return true;
}

/**
 * Retrieves only the classes assigned to a specific teacher within their school,
 * grouped by class and subject with their assigned departments.
 */
export async function getTeacherAssignedClasses(teacherId: string, schoolId: string) {
  const assignments = await prisma.teacherAssignment.findMany({
    where: {
      school_id: schoolId,
      teacher_id: teacherId,
    },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          created_at: true,
          _count: {
            select: { students: true },
          },
        },
      },
      subject: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      department: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Group by class -> subject -> list of departments
  const classMap = new Map<string, {
    id: string;
    name: string;
    studentCount: number;
    subjects: {
      id: string;
      name: string;
      code: string | null;
      departments: { id: string | null; name: string }[];
    }[];
  }>();

  for (const a of assignments) {
    if (!classMap.has(a.class.id)) {
      classMap.set(a.class.id, {
        id: a.class.id,
        name: a.class.name,
        studentCount: a.class._count.students,
        subjects: [],
      });
    }
    const entry = classMap.get(a.class.id)!;
    let subj = entry.subjects.find((s) => s.id === a.subject.id);
    if (!subj) {
      subj = {
        id: a.subject.id,
        name: a.subject.name,
        code: a.subject.code,
        departments: [],
      };
      entry.subjects.push(subj);
    }

    if (a.department_id === null) {
      if (!subj.departments.some((d) => d.id === null)) {
        subj.departments.push({ id: null, name: 'All departments' });
      }
    } else if (a.department) {
      if (!subj.departments.some((d) => d.id === a.department!.id)) {
        subj.departments.push({ id: a.department.id, name: a.department.name });
      }
    }
  }

  return Array.from(classMap.values());
}
