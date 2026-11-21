// src/modules/results/reportService.ts
import { prisma } from '@/lib/prisma';
import { getCachedReportCard, setCachedReportCard } from '@/modules/cache/cacheService';

export class ReportService {
  /**
   * Retrieves compiled student results for a term with caching.
   * If the student has a department, only subjects offered by that department are included.
   * If the student has no department, all submitted subjects are included.
   */
  static async getStudentTermReport(schoolId: string, studentId: string, termId: string) {
    // 1. Fetch student info to know department
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        department_id: true,
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

    if (!student) return [];

    // Cache key incorporates student department to avoid cache pollution across department changes
    const cacheKey = `${termId}:${student.department_id || 'nodept'}`;

    // 2. Try cache
    const cached = getCachedReportCard(schoolId, studentId, cacheKey);
    if (cached) return cached;

    // 3. Query DB
    const results = await prisma.result.findMany({
      where: {
        school_id: schoolId,
        student_id: studentId,
        term_id: termId,
        status: 'SUBMITTED',
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
      },
      orderBy: { subject: { name: 'asc' } },
    });

    // 4. Filter by department if student has one
    let filteredResults = results;
    if (student.department_id && student.department) {
      const offeredSubjectIds = new Set(
        student.department.departmentSubjects.map((ds) => ds.subject_id)
      );
      filteredResults = results.filter((r) => offeredSubjectIds.has(r.subject.id));
    }

    const formatted = filteredResults.map((r) => ({
      subject: r.subject.name,
      ca_score: r.ca_score ? Number(r.ca_score) : null,
      exam_score: r.exam_score ? Number(r.exam_score) : null,
      total: r.total ? Number(r.total) : null,
      grade: r.grade,
      remark: r.remark,
    }));

    // 5. Cache
    setCachedReportCard(schoolId, studentId, cacheKey, formatted);
    return formatted;
  }
}
