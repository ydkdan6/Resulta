// src/modules/results/scoreService.ts
import { prisma } from '@/lib/prisma';
import { validateScores, ScoreRowInput } from '@/lib/scores/validateScores';
import type { SchemeData } from '@/lib/grading/calculate';
import { invalidatePublishedReports } from '@/modules/cache/cacheService';

export interface SaveScoresOptions {
  schoolId: string;
  classId: string;
  subjectId: string;
  termId: string;
  scores: ScoreRowInput[];
  scheme?: SchemeData;
}

export interface SubmitScoresOptions extends SaveScoresOptions {
  confirmed: boolean;
}

export interface UnlockScoresOptions {
  schoolId: string;
  userId: string;
  classId: string;
  subjectId: string;
  termId: string;
  reason: string;
}

export class ScoreService {
  /**
   * Saves draft scores without locking.
   */
  static async saveDraft(options: SaveScoresOptions) {
    const { schoolId, classId, subjectId, termId, scores, scheme } = options;

    const classObj = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { status: 'ACTIVE' },
          select: { id: true, admission_number: true, full_name: true, status: true },
        },
      },
    });

    if (!classObj || classObj.school_id !== schoolId) {
      throw new Error('Class not found');
    }

    // Lock check: teacher cannot edit already-submitted scores
    const studentIds = classObj.students.map((s) => s.id);
    const existingSubmitted = await prisma.result.findFirst({
      where: {
        school_id: schoolId,
        subject_id: subjectId,
        term_id: termId,
        student_id: { in: studentIds },
        status: 'SUBMITTED',
      },
    });

    if (existingSubmitted) {
      throw new Error('Scores for this class and subject have been submitted and locked. You must request the school administrator to unlock them before editing.');
    }

    const validation = validateScores({
      rows: scores,
      scheme: scheme || { parts: [{ name: 'CA', max: 40 }, { name: 'Exam', max: 60 }], boundaries: [] },
      students: classObj.students,
      isSubmission: false,
    });
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    // Bulk upsert in transaction
    const upsertPromises = validation.validatedRows.map((row) =>
      prisma.result.upsert({
        where: {
          student_id_term_id_subject_id: {
            student_id: row.student_id,
            term_id: termId,
            subject_id: subjectId,
          },
        },
        create: {
          school_id: schoolId,
          student_id: row.student_id,
          term_id: termId,
          subject_id: subjectId,
          ca_score: row.ca_score,
          exam_score: row.exam_score,
          total: row.total,
          grade: row.grade,
          remark: row.remark,
          status: 'DRAFT',
        },
        update: {
          ca_score: row.ca_score,
          exam_score: row.exam_score,
          total: row.total,
          grade: row.grade,
          remark: row.remark,
          status: 'DRAFT',
        },
      })
    );

    await prisma.$transaction(upsertPromises);

    return {
      success: true,
      count: validation.validatedRows.length,
      status: 'DRAFT',
    };
  }

  /**
   * Submits scores, locking them and invalidating published caches.
   */
  static async submitScores(options: SubmitScoresOptions) {
    const { schoolId, classId, subjectId, termId, confirmed, scores, scheme } = options;

    if (!confirmed) {
      throw new Error('Confirmation of two-step review is required.');
    }

    const classObj = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          where: { status: 'ACTIVE' },
          select: { id: true, admission_number: true, full_name: true, status: true },
        },
      },
    });

    if (!classObj || classObj.school_id !== schoolId) {
      throw new Error('Class not found');
    }

    // Lock check
    const studentIds = classObj.students.map((s) => s.id);
    const existingSubmitted = await prisma.result.findFirst({
      where: {
        school_id: schoolId,
        subject_id: subjectId,
        term_id: termId,
        student_id: { in: studentIds },
        status: 'SUBMITTED',
      },
    });

    if (existingSubmitted) {
      throw new Error('Scores for this class and subject have already been submitted and locked.');
    }

    const validation = validateScores({
      rows: scores,
      scheme: scheme || { parts: [{ name: 'CA', max: 40 }, { name: 'Exam', max: 60 }], boundaries: [] },
      students: classObj.students,
      isSubmission: true,
    });
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    const upsertPromises = validation.validatedRows.map((row) =>
      prisma.result.upsert({
        where: {
          student_id_term_id_subject_id: {
            student_id: row.student_id,
            term_id: termId,
            subject_id: subjectId,
          },
        },
        create: {
          school_id: schoolId,
          student_id: row.student_id,
          term_id: termId,
          subject_id: subjectId,
          ca_score: row.ca_score,
          exam_score: row.exam_score,
          total: row.total,
          grade: row.grade,
          remark: row.remark,
          status: 'SUBMITTED',
        },
        update: {
          ca_score: row.ca_score,
          exam_score: row.exam_score,
          total: row.total,
          grade: row.grade,
          remark: row.remark,
          status: 'SUBMITTED',
        },
      })
    );

    await prisma.$transaction(upsertPromises);

    // Invalidate report cache when scores are submitted / published
    invalidatePublishedReports(schoolId, termId);

    return {
      success: true,
      count: validation.validatedRows.length,
      status: 'SUBMITTED',
    };
  }

  /**
   * Unlocks scores back to DRAFT with audit trail and cache invalidation.
   */
  static async unlockScores(options: UnlockScoresOptions) {
    const { schoolId, userId, classId, subjectId, termId, reason } = options;

    const classObj = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: { select: { id: true } },
      },
    });

    if (!classObj || classObj.school_id !== schoolId) {
      throw new Error('Class not found');
    }

    const studentIds = classObj.students.map((s) => s.id);

    const unlockedCount = await prisma.$transaction(async (tx) => {
      const updateRes = await tx.result.updateMany({
        where: {
          school_id: schoolId,
          subject_id: subjectId,
          term_id: termId,
          student_id: { in: studentIds },
          status: 'SUBMITTED',
        },
        data: {
          status: 'DRAFT',
        },
      });

      await tx.auditLog.create({
        data: {
          school_id: schoolId,
          user_id: userId,
          action: 'RESULT_UNLOCK',
          entity: 'Result',
          entity_id: `${classId}:${subjectId}:${termId}`,
          reason: reason.trim(),
          old_values: { status: 'SUBMITTED' },
          new_values: {
            status: 'DRAFT',
            class_id: classId,
            subject_id: subjectId,
            term_id: termId,
            unlocked_count: updateRes.count,
          },
        },
      });

      return updateRes.count;
    });

    // Invalidate cache immediately
    invalidatePublishedReports(schoolId, termId);

    return {
      success: true,
      unlocked_count: unlockedCount,
    };
  }
}
