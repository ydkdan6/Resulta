// src/app/api/parent/results/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getParentSession } from '@/lib/auth/parentSession';
import { logger } from '@/lib/logger';
import {
  getCachedSchoolBranding,
  getCachedReportCard,
  setCachedReportCard,
  PRIVATE_NO_CACHE_HEADERS,
} from '@/modules/cache/cacheService';

/**
 * GET /api/parent/results
 * Returns academic terms and results accessible with the authenticated parent session.
 *
 * Rules:
 * - Current term first, then earlier published terms up to the PIN's term.
 * - Terms that are locked or unpublished do not appear.
 * - Later terms are never shown.
 * - If student has a department, only subjects offered by that department are shown.
 * - If student has no department, all subjects appear.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getParentSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Session expired or unauthenticated.' }, { status: 401 });
    }

    const { student_id, school_id, pin_session, pin_term_number } = session;

    // Fetch school info (cached)
    let school = await getCachedSchoolBranding(school_id);
    if (!school) {
      school = await prisma.school.findUnique({
        where: { id: school_id },
        select: { id: true, name: true, slug: true, logo_url: true },
      });
    }

    // Student info including department & offered subjects
    const student = await prisma.student.findUnique({
      where: { id: student_id },
      select: {
        id: true,
        admission_number: true,
        full_name: true,
        department_id: true,
        class: { select: { id: true, name: true } },
        department: {
          select: {
            id: true,
            name: true,
            departmentSubjects: {
              select: { subject_id: true },
            },
          },
        },
      },
    });

    if (!student || !school) {
      return NextResponse.json({ error: 'Student record not found.' }, { status: 404 });
    }

    // Terms accessible:
    const allPublishedTerms = await prisma.term.findMany({
      where: {
        school_id,
        status: 'PUBLISHED',
      },
      orderBy: [{ session: 'desc' }, { term_number: 'desc' }],
    });

    const accessibleTerms = allPublishedTerms.filter((t) => {
      if (t.session < pin_session) return true;
      if (t.session === pin_session && t.term_number <= pin_term_number) return true;
      return false; // Later terms are never shown!
    });

    // Check withhold / locks per student for these terms
    const studentStatuses = await prisma.studentTermStatus.findMany({
      where: {
        student_id,
        term_id: { in: accessibleTerms.map((t) => t.id) },
      },
      select: { term_id: true, result_locked: true },
    });

    const lockedTermIds = new Set(
      studentStatuses.filter((s) => s.result_locked).map((s) => s.term_id)
    );

    // Filter out locked terms
    const visibleTerms = accessibleTerms.filter((t) => !lockedTermIds.has(t.id));

    // Department offered subject IDs
    const offeredSubjectIds =
      student.department_id && student.department
        ? new Set(student.department.departmentSubjects.map((ds) => ds.subject_id))
        : null;

    // For visible terms, retrieve from cache or query DB
    const termsWithResults = await Promise.all(
      visibleTerms.map(async (t) => {
        const cacheKey = `${t.id}:${student.department_id || 'nodept'}`;
        const cachedResults = getCachedReportCard(school_id, student_id, cacheKey);
        if (cachedResults) {
          return {
            id: t.id,
            name: `Term ${t.term_number} (${t.session})`,
            session: t.session,
            term_number: t.term_number,
            is_current: t.id === session.pin_term_id,
            subjects: cachedResults,
          };
        }

        // Fetch student's submitted results for this term
        const results = await prisma.result.findMany({
          where: {
            school_id,
            student_id,
            term_id: t.id,
            status: 'SUBMITTED',
          },
          include: {
            subject: { select: { id: true, name: true, code: true } },
          },
          orderBy: { subject: { name: 'asc' } },
        });

        // Filter by student's department if present
        const filteredResults = offeredSubjectIds
          ? results.filter((r) => offeredSubjectIds.has(r.subject.id))
          : results;

        const termResults = filteredResults.map((r) => ({
          subject: r.subject.name,
          ca_score: r.ca_score ? Number(r.ca_score) : null,
          exam_score: r.exam_score ? Number(r.exam_score) : null,
          total: r.total ? Number(r.total) : null,
          grade: r.grade,
          remark: r.remark,
        }));

        // Cache the published report card
        setCachedReportCard(school_id, student_id, cacheKey, termResults);

        return {
          id: t.id,
          name: `Term ${t.term_number} (${t.session})`,
          session: t.session,
          term_number: t.term_number,
          is_current: t.id === session.pin_term_id,
          subjects: termResults,
        };
      })
    );

    return NextResponse.json(
      {
        school,
        student: {
          id: student.id,
          admission_number: student.admission_number,
          full_name: student.full_name,
          class: student.class,
          department: student.department ? { id: student.department.id, name: student.department.name } : null,
        },
        terms: termsWithResults,
      },
      {
        headers: PRIVATE_NO_CACHE_HEADERS,
      }
    );
  } catch (e: unknown) {
    logger.error('[api/parent/results GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
