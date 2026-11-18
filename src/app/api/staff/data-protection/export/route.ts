// src/app/api/staff/data-protection/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, AuthError } from '@/lib/auth/scope';
import { recordAuditLog } from '@/lib/audit';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth(undefined, request);
    if (session.role !== 'school_admin' && session.role !== 'platform_admin') {
      throw new AuthError('School administrator privileges required.', 403);
    }

    const url = new URL(request.url);
    const targetSchoolId = session.role === 'platform_admin'
      ? url.searchParams.get('schoolId') || session.school_id
      : session.school_id;

    if (!targetSchoolId) {
      throw new AuthError('School context missing.', 400);
    }

    const school = await prisma.school.findUnique({
      where: { id: targetSchoolId },
      include: {
        classes: {
          select: { id: true, name: true, created_at: true },
        },
        subjects: {
          select: { id: true, name: true, code: true },
        },
        terms: {
          select: { id: true, session: true, term_number: true, status: true },
        },
        students: {
          select: {
            id: true,
            admission_number: true,
            full_name: true,
            status: true,
            created_at: true,
            updated_at: true,
            class: { select: { id: true, name: true } },
          },
        },
        results: {
          select: {
            id: true,
            student_id: true,
            term_id: true,
            subject: { select: { name: true, code: true } },
            ca_score: true,
            exam_score: true,
            total: true,
            grade: true,
            remark: true,
            status: true,
          },
        },
      },
    });

    if (!school) {
      return NextResponse.json({ error: 'School not found.' }, { status: 404 });
    }

    // Structure NDPA export document
    const exportData = {
      compliance: {
        regulation: 'Nigeria Data Protection Act (NDPA) 2023',
        export_date: new Date().toISOString(),
        exported_by: {
          user_id: session.id,
          name: session.name,
          role: session.role,
        },
      },
      school: {
        id: school.id,
        name: school.name,
        slug: school.slug,
        created_at: school.created_at,
      },
      academic_structure: {
        classes: school.classes,
        subjects: school.subjects,
        terms: school.terms,
      },
      students: school.students.map((s) => ({
        ...s,
        results: school.results.filter((r) => r.student_id === s.id),
      })),
      statistics: {
        total_students: school.students.length,
        total_results: school.results.length,
      },
    };

    // Log the data export for NDPA audit trail
    await recordAuditLog({
      action: 'DATA_EXPORT_NDPA',
      schoolId: targetSchoolId,
      userId: session.id,
      entity: 'SchoolData',
      entityId: targetSchoolId,
      details: {
        student_count: school.students.length,
        result_count: school.results.length,
      },
      reason: 'NDPA Data Portability Export Request',
    });

    const filename = `ndpa-data-export-${school.slug}-${new Date().toISOString().slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    logger.error('Data export error', error);
    return NextResponse.json({ error: 'Failed to export school data.' }, { status: 500 });
  }
}
