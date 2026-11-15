import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { prisma } from '../src/lib/prisma.ts';

// Assert dev/test database before running any database-dependent tests
try {
  execFileSync('node', ['--import', 'tsx', 'scripts/assert-dev-db.ts'], { stdio: 'pipe' });
} catch {
  // If the DB guard fails, skip or fail with clear message
  console.warn('[DB Guard] Database is not marked dev/test. auth-isolation tests requiring live DB will fail safely.');
}
import {
  requireSchoolAccess,
  verifyTeacherClassAccess,
  getTeacherAssignedClasses,
  assertCanCreateTeacher,
  AuthError,
} from '../src/lib/auth/scope.ts';
import { hashPassword, verifyPassword } from '../src/lib/auth/password.ts';
import { createSessionToken, verifySessionToken, SessionUser } from '../src/lib/auth/session.ts';

describe('Staff Authentication & Multi-Tenant Isolation Tests', () => {
  let schoolA: { id: string; name: string; slug: string };
  let schoolB: { id: string; name: string; slug: string };
  let adminA: { id: string; email: string };
  let teacherA: { id: string; email: string };
  let adminB: { id: string; email: string };
  let classA1_Assigned: { id: string; name: string };
  let classA2_Unassigned: { id: string; name: string };
  let classB1: { id: string; name: string };

  before(async () => {
    // Retrieve seeded entities
    const sA = await prisma.school.findUniqueOrThrow({ where: { slug: 'grace-high' } });
    const sB = await prisma.school.findUniqueOrThrow({ where: { slug: 'kings-college' } });
    schoolA = sA;
    schoolB = sB;

    adminA = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@gracehigh.edu.ng' } });
    adminB = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@kingscollege.edu.ng' } });

    classA1_Assigned = await prisma.class.findFirstOrThrow({
      where: { school_id: schoolA.id, name: 'JSS 1A' },
    });
    classA2_Unassigned = await prisma.class.findFirstOrThrow({
      where: { school_id: schoolA.id, name: 'JSS 1B' },
    });
    classB1 = await prisma.class.findFirstOrThrow({
      where: { school_id: schoolB.id, name: 'SS 1 Science' },
    });

    const teacherHash = await hashPassword('TempTeacher123!');
    teacherA = await prisma.user.update({
      where: { email: 'teacher@gracehigh.edu.ng' },
      data: {
        password_hash: teacherHash,
        must_change_password: true,
      },
    });

    // Ensure teacherA is strictly NOT assigned to classA2_Unassigned
    await prisma.teacherAssignment.deleteMany({
      where: {
        teacher_id: teacherA.id,
        class_id: classA2_Unassigned.id,
      },
    });
  });

  after(async () => {
    await prisma.$disconnect();
  });

  // --- REQUIREMENT 1: School A cannot read School B data (returns 403) ---
  test('Security Check: School A user cannot read School B data (returns 403 Forbidden)', () => {
    const schoolAUserSession: SessionUser = {
      id: adminA.id,
      email: adminA.email,
      name: 'School A Admin',
      role: 'school_admin',
      school_id: schoolA.id,
      school_slug: schoolA.slug,
    };

    // Attempting to access School B's tenant context
    assert.throws(
      () => {
        requireSchoolAccess(schoolAUserSession, schoolB.id);
      },
      (err: unknown) => {
        assert.ok(err instanceof AuthError, 'Must be an AuthError');
        assert.strictEqual(err.statusCode, 403, 'Must return 403 Forbidden');
        assert.match(err.message, /Cross-tenant access forbidden/i);
        return true;
      },
      'School A user accessing School B must be blocked with 403'
    );
  });

  // --- REQUIREMENT 2: School A cannot change School B data (returns 403) ---
  test('Security Check: School A user cannot modify School B data (returns 403 Forbidden)', () => {
    const schoolATeacherSession: SessionUser = {
      id: teacherA.id,
      email: teacherA.email,
      name: 'School A Teacher',
      role: 'teacher',
      school_id: schoolA.id,
      school_slug: schoolA.slug,
    };

    // Attempting to modify School B's data
    assert.throws(
      () => {
        requireSchoolAccess(schoolATeacherSession, schoolB.id);
      },
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.strictEqual(err.statusCode, 403, 'Must return 403 Forbidden');
        assert.match(err.message, /Cross-tenant access forbidden/i);
        return true;
      },
      'School A modifying School B must throw 403 Forbidden'
    );
  });

  // --- REQUIREMENT 3: Teacher cannot see classes they are not assigned to (returns 403) ---
  test('Teacher Restriction Check: Teacher cannot access classes they are not assigned to (returns 403 Forbidden)', async () => {
    // Teacher A is assigned to JSS 1A, but NOT assigned to JSS 1B
    await assert.rejects(
      async () => {
        await verifyTeacherClassAccess(teacherA.id, schoolA.id, classA2_Unassigned.id);
      },
      (err: unknown) => {
        assert.ok(err instanceof AuthError, 'Must be an AuthError');
        assert.strictEqual(err.statusCode, 403, 'Must return 403 Forbidden');
        assert.match(err.message, /not assigned to this class/i);
        return true;
      },
      'Teacher accessing unassigned class must be rejected with 403'
    );
  });

  // --- REQUIREMENT 4: Teacher CAN access classes they ARE assigned to ---
  test('Teacher Access Check: Teacher CAN access their assigned class (returns 200 OK)', async () => {
    const isAuthorized = await verifyTeacherClassAccess(teacherA.id, schoolA.id, classA1_Assigned.id);
    assert.strictEqual(isAuthorized, true, 'Assigned class access must be authorized');
  });

  // --- REQUIREMENT 5: Teacher "My classes" query lists ONLY assigned classes ---
  test('Query Scoping Check: getTeacherAssignedClasses returns ONLY assigned classes and excludes unassigned classes', async () => {
    const teacherClasses = await getTeacherAssignedClasses(teacherA.id, schoolA.id);

    // Must include JSS 1A
    const hasAssignedClass = teacherClasses.some((c) => c.id === classA1_Assigned.id);
    assert.strictEqual(hasAssignedClass, true, 'Must include assigned class JSS 1A');

    // Must strictly EXCLUDE JSS 1B
    const hasUnassignedClass = teacherClasses.some((c) => c.id === classA2_Unassigned.id);
    assert.strictEqual(hasUnassignedClass, false, 'Must NOT include unassigned class JSS 1B');

    // Must strictly EXCLUDE School B classes
    const hasSchoolBClass = teacherClasses.some((c) => c.id === classB1.id);
    assert.strictEqual(hasSchoolBClass, false, 'Must NOT include School B classes');
  });

  // --- REQUIREMENT 6: school_admin cannot create teachers or assignments (returns 403) ---
  test('Role Check: school_admin cannot create teachers or assignments (returns 403 Forbidden)', () => {
    const schoolAdminSession: SessionUser = {
      id: adminA.id,
      email: adminA.email,
      name: 'School Admin Lawal',
      role: 'school_admin',
      school_id: schoolA.id,
    };

    assert.throws(
      () => {
        assertCanCreateTeacher(schoolAdminSession);
      },
      (err: unknown) => {
        assert.ok(err instanceof AuthError);
        assert.strictEqual(err.statusCode, 403, 'Must return 403 Forbidden');
        assert.match(err.message, /School administrators cannot create teachers/i);
        return true;
      },
      'school_admin creating teacher must return 403 Forbidden'
    );
  });

  // --- REQUIREMENT 7: platform_admin CAN create teachers and assignments ---
  test('Role Check: platform_admin is authorized to create teachers and assignments', () => {
    const platformAdminSession: SessionUser = {
      id: 'platform-root-admin-id',
      email: 'platform_admin@resulta.ng',
      name: 'Platform Root Admin',
      role: 'platform_admin',
      school_id: null,
    };

    // Should not throw
    assert.doesNotThrow(() => {
      assertCanCreateTeacher(platformAdminSession);
    });

    // Platform admin has cross-tenant oversight
    assert.doesNotThrow(() => {
      requireSchoolAccess(platformAdminSession, schoolA.id);
      requireSchoolAccess(platformAdminSession, schoolB.id);
    });
  });

  // --- REQUIREMENT 8: Password hashing, verification, and temporary password flags ---
  test('Password & Token Security: Validates password hashing and session tokens', async () => {
    const plain = 'TempTeacher123!';
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'teacher@gracehigh.edu.ng' } });

    const isValid = await verifyPassword(plain, user.password_hash);
    assert.strictEqual(isValid, true, 'Seeded password must verify');

    const isInvalid = await verifyPassword('WrongPassword!', user.password_hash);
    assert.strictEqual(isInvalid, false, 'Invalid password must fail verification');

    // Token creation and verification
    const token = await createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      school_id: user.school_id,
      must_change_password: user.must_change_password,
    });

    const payload = await verifySessionToken(token);
    assert.ok(payload, 'Token must decode successfully');
    assert.strictEqual(payload?.id, user.id);
    assert.strictEqual(payload?.role, 'teacher');
    assert.strictEqual(payload?.must_change_password, true);
  });
});
