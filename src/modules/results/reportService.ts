// src/modules/results/reportService.ts
import { prisma } from '@/lib/prisma';
import { getCachedReportCard, setCachedReportCard } from '@/modules/cache/cacheService';

export class ReportService {
  /**
   * Retrieves compiled student results for a term with caching.
   */
  static async getStudentTermReport(schoolId: string, studentId: string, termId: string) {
    // 1. Try cache
    const cached = getCachedReportCard(schoolId, studentId, termId);
    if (cached) return cached;

    // 2. Query DB
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

    const formatted = results.map((r) => ({
      subject: r.subject.name,
      ca_score: r.ca_score ? Number(r.ca_score) : null,
      exam_score: r.exam_score ? Number(r.exam_score) : null,
      total: r.total ? Number(r.total) : null,
      grade: r.grade,
      remark: r.remark,
    }));

    // 3. Cache
    setCachedReportCard(schoolId, studentId, termId, formatted);
    return formatted;
  }
}
