// src/app/api/parent/results/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getParentSession } from '@/lib/auth/parentSession';

/**
 * GET /api/parent/results
 * Returns academic terms and results accessible with the authenticated parent session.
 *
 * Rules:
 * - Current term first, then earlier published terms up to the PIN's term.
 * - Terms that are locked or unpublished do not appear.
 * - Later terms are never shown.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getParentSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Session expired or unauthenticated.' }, { status: 401 });
    }

    const { student_id, school_id, pin_session, pin_term_number } = session;

    // Fetch school info
    const school = await prisma.school.findUnique({
      where: { id: school_id },
      select: { id: true, name: true, slug: true, logo_url: true },
    });

    // Student info
    const student = await prisma.student.findUnique({
      where: { id: student_id },
      select: {
        id: true,
        admission_number: true,
        full_name: true,
        class: { select: { id: true, name: true } },
      },
    });

    if (!student || !school) {
      return NextResponse.json({ error: 'Student record not found.' }, { status: 404 });
    }

    // Terms accessible:
    // Published terms belonging to this school, up to the PIN's term:
    // (session < pin_session) OR (session == pin_session AND term_number <= pin_term_number)
    // Later terms are NEVER shown.
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

    // Filter out locked terms: "Terms that are locked or unpublished do not appear"
    const visibleTerms = accessibleTerms.filter((t) => !lockedTermIds.has(t.id));

    // Fetch student's submitted results for all visible terms
    const results = await prisma.result.findMany({
      where: {
        school_id,
        student_id,
        term_id: { in: visibleTerms.map((t) => t.id) },
        status: 'SUBMITTED',
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
      },
      orderBy: { subject: { name: 'asc' } },
    });

    const termsWithResults = visibleTerms.map((t) => {
      const termResults = results
        .filter((r) => r.term_id === t.id)
        .map((r) => ({
          subject: r.subject.name,
          ca_score: r.ca_score ? Number(r.ca_score) : null,
          exam_score: r.exam_score ? Number(r.exam_score) : null,
          total: r.total ? Number(r.total) : null,
          grade: r.grade,
          remark: r.remark,
        }));

      return {
        id: t.id,
        name: `Term ${t.term_number} (${t.session})`,
        session: t.session,
        term_number: t.term_number,
        is_current: t.id === session.pin_term_id,
        subjects: termResults,
      };
    });

    return NextResponse.json({
      school,
      student,
      terms: termsWithResults,
    });
  } catch (e: unknown) {
    console.error('[api/parent/results GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
