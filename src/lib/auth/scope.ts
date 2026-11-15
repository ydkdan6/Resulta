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
export async function requirePlatformAdmin(providedSession?: SessionUser | null): Promise<SessionUser> {
  const session = await requireAuth(providedSession);
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
 * Retrieves only the classes assigned to a specific teacher within their school.
 * Guarantees a teacher cannot see unassigned classes.
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
    },
  });

  // Group subjects by class
  const classMap = new Map<string, {
    id: string;
    name: string;
    studentCount: number;
    subjects: { id: string; name: string; code: string | null }[];
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
    if (!entry.subjects.some((s) => s.id === a.subject.id)) {
      entry.subjects.push({
        id: a.subject.id,
        name: a.subject.name,
        code: a.subject.code,
      });
    }
  }

  return Array.from(classMap.values());
}
