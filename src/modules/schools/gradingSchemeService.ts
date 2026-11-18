// src/modules/schools/gradingSchemeService.ts
import { prisma } from '@/lib/prisma';
import { getCachedGradingScheme, invalidateGradingScheme } from '@/modules/cache/cacheService';
import { evaluateScheme } from '@/lib/grading/calculate';

export class GradingSchemeService {
  static async getScheme(schoolId: string, classLevel?: string | null) {
    return getCachedGradingScheme(schoolId, classLevel);
  }

  static async saveScheme(schoolId: string, data: { name: string; class_level?: string | null; parts: any; boundaries: any }) {
    const existing = await prisma.gradingScheme.findFirst({
      where: {
        school_id: schoolId,
        class_level: data.class_level || null,
      },
    });

    let result;
    if (existing) {
      result = await prisma.gradingScheme.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          parts: data.parts,
          boundaries: data.boundaries,
        },
      });
    } else {
      result = await prisma.gradingScheme.create({
        data: {
          school_id: schoolId,
          name: data.name,
          class_level: data.class_level || null,
          parts: data.parts,
          boundaries: data.boundaries,
        },
      });
    }

    invalidateGradingScheme(schoolId);
    return result;
  }

  static evaluateScores(scheme: any, scores: Record<string, number>) {
    return evaluateScheme(scheme, scores);
  }
}
