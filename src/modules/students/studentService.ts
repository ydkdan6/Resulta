// src/modules/students/studentService.ts
import { prisma } from '@/lib/prisma';
import { StudentStatus } from '@prisma/client';

export interface ListStudentsOptions {
  classId?: string;
  status?: StudentStatus;
  search?: string;
  page?: number;
  limit?: number;
}

export class StudentService {
  static async getById(id: string, schoolId?: string) {
    return prisma.student.findFirst({
      where: {
        id,
        ...(schoolId ? { school_id: schoolId } : {}),
      },
      include: {
        class: true,
        termStatuses: true,
      },
    });
  }

  static async getByAdmissionNumber(admissionNumber: string, schoolId: string) {
    return prisma.student.findFirst({
      where: {
        school_id: schoolId,
        admission_number: admissionNumber.trim(),
      },
      include: {
        class: true,
      },
    });
  }

  static async listStudents(schoolId: string, options: ListStudentsOptions = {}) {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const skip = (page - 1) * limit;

    const where: any = {
      school_id: schoolId,
    };

    if (options.classId) {
      where.class_id = options.classId;
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.search) {
      const q = options.search.trim();
      where.OR = [
        { full_name: { contains: q, mode: 'insensitive' } },
        { admission_number: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ class: { name: 'asc' } }, { full_name: 'asc' }],
        include: {
          class: { select: { id: true, name: true } },
        },
      }),
      prisma.student.count({ where }),
    ]);

    return {
      students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async updateStudent(id: string, schoolId: string, data: { full_name?: string; class_id?: string; status?: StudentStatus }) {
    const student = await prisma.student.findFirst({
      where: { id, school_id: schoolId },
    });
    if (!student) return null;

    return prisma.student.update({
      where: { id },
      data,
    });
  }

  static async deleteStudent(id: string, schoolId: string) {
    const student = await prisma.student.findFirst({
      where: { id, school_id: schoolId },
    });
    if (!student) return null;

    return prisma.student.delete({
      where: { id },
    });
  }
}
