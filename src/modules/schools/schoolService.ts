// src/modules/schools/schoolService.ts
import { prisma } from '@/lib/prisma';
import { getCachedSchoolBranding, invalidateSchoolBranding } from '@/modules/cache/cacheService';

export interface UpdateSchoolInput {
  name?: string;
  logo_url?: string | null;
  card_price?: number;
  platform_share?: number;
}

export class SchoolService {
  static async getById(id: string) {
    return prisma.school.findUnique({
      where: { id },
    });
  }

  static async getBySlug(slug: string) {
    return prisma.school.findUnique({
      where: { slug: slug.toLowerCase() },
    });
  }

  static async getBranding(schoolIdOrSlug: string) {
    return getCachedSchoolBranding(schoolIdOrSlug);
  }

  static async updateSettings(id: string, data: UpdateSchoolInput) {
    const updated = await prisma.school.update({
      where: { id },
      data,
    });
    invalidateSchoolBranding(id);
    invalidateSchoolBranding(updated.slug);
    return updated;
  }

  static async listSchools(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [schools, total] = await Promise.all([
      prisma.school.findMany({
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { students: true, classes: true, subjects: true },
          },
        },
      }),
      prisma.school.count(),
    ]);

    return {
      schools,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
