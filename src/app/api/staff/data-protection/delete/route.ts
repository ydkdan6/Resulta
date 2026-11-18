// src/app/api/staff/data-protection/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { DataDeleteSchema } from '@/lib/validation/schemas';
import { validateInput } from '@/lib/validation/validate';
import { recordAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
      throw new AuthError('Administrator privileges required.', 403);
    }

    const school_id = session.school_id;
    const rawBody = await request.json().catch(() => null);
    const validation = validateInput(DataDeleteSchema, rawBody);
    if (!validation.success) {
      return validation.response;
    }

    const { scope, studentId, confirmText, reason } = validation.data;

    // Scope 1: Delete a specific student (Right to Erasure under NDPA)
    if (scope === 'STUDENT') {
      if (!studentId) {
        return NextResponse.json({ error: 'studentId is required for student data erasure.' }, { status: 400 });
      }

      const student = await prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true, school_id: true, admission_number: true, full_name: true },
      });

      if (!student) {
        return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
      }

      // Tenant isolation: school_admin can only delete students in their own school
      if (session.role !== 'platform_admin' && student.school_id !== school_id) {
        return NextResponse.json({ error: 'Forbidden: Cannot delete student from another school.' }, { status: 403 });
      }

      // Execute deletion with cascade
      await prisma.student.delete({
        where: { id: studentId },
      });

      // Record audit log entry
      await recordAuditLog({
        action: 'DATA_DELETE_STUDENT_NDPA',
        schoolId: student.school_id,
        userId: session.id,
        entity: 'Student',
        entityId: studentId,
        details: {
          admission_number: student.admission_number,
          student_id: student.id,
        },
        reason: reason.trim(),
      });

      return NextResponse.json({
        success: true,
        message: `Student ${student.admission_number} data has been permanently erased under NDPA right to erasure.`,
        deleted_id: student.id,
      });
    }

    // Scope 2: School-level data purge (Platform admin or verified school admin)
    if (scope === 'SCHOOL') {
      const targetSchoolId = session.role === 'platform_admin'
        ? rawBody?.schoolId || school_id
        : school_id;

      if (!targetSchoolId) {
        return NextResponse.json({ error: 'targetSchoolId is required.' }, { status: 400 });
      }

      const school = await prisma.school.findUnique({
        where: { id: targetSchoolId },
        select: { id: true, name: true, slug: true },
      });

      if (!school) {
        return NextResponse.json({ error: 'School not found.' }, { status: 404 });
      }

      // Require explicit confirmation text "DELETE <slug>"
      const expectedConfirm = `DELETE ${school.slug}`;
      if (confirmText !== expectedConfirm) {
        return NextResponse.json(
          { error: `Confirmation mismatch. You must provide confirmText: "${expectedConfirm}" to purge school data.` },
          { status: 400 }
        );
      }

      // Purge all student personal data in this school
      const deletedStudents = await prisma.student.deleteMany({
        where: { school_id: targetSchoolId },
      });

      await recordAuditLog({
        action: 'DATA_DELETE_SCHOOL_NDPA',
        schoolId: targetSchoolId,
        userId: session.id,
        entity: 'School',
        entityId: targetSchoolId,
        details: {
          erased_student_count: deletedStudents.count,
        },
        reason: reason.trim(),
      });

      return NextResponse.json({
        success: true,
        message: `Purged all student personal records for ${school.name} (${deletedStudents.count} students deleted).`,
        count: deletedStudents.count,
      });
    }

    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error('Data delete error', error);
    return NextResponse.json({ error: 'Failed to delete data.' }, { status: 500 });
  }
}
