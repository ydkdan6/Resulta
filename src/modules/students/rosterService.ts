// src/modules/students/rosterService.ts
import { prisma } from '@/lib/prisma';
import {
  parseFileToRawRows,
  validateRosterRows,
  generateErrorReportCsv,
  RawRosterRow,
  ValidatedRosterRow,
  MAX_ROWS_LIMIT,
} from '@/lib/roster/parseAndValidate';
import { logger } from '@/lib/logger';

export interface ImportRosterOptions {
  schoolId: string;
  userId?: string;
  fileName?: string;
  rows: RawRosterRow[];
  skipBadRows?: boolean;
  createMissingClasses?: boolean;
  isCompleteList?: boolean;
  onProgress?: (percent: number) => void;
}

export class RosterService {
  static parseFile(fileName: string, buffer: Buffer) {
    return parseFileToRawRows(fileName, buffer);
  }

  static validateRows(
    rows: RawRosterRow[],
    existingStudents: { admission_number: string; full_name: string; class_name: string }[],
    existingClassNames: string[]
  ) {
    return validateRosterRows(rows, existingStudents, existingClassNames);
  }

  static generateErrorReport(errorRows: ValidatedRosterRow[]) {
    return generateErrorReportCsv(errorRows);
  }

  /**
   * Imports roster rows in chunks to prevent database transaction timeouts.
   * Reports progress (0 to 100) for UI or background job queues.
   */
  static async importRoster(options: ImportRosterOptions) {
    const {
      schoolId,
      userId,
      fileName = 'roster-import',
      rows,
      skipBadRows = false,
      createMissingClasses = false,
      isCompleteList = false,
      onProgress,
    } = options;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error('No rows provided for import');
    }

    if (rows.length > MAX_ROWS_LIMIT) {
      throw new Error(`Row count exceeds maximum limit of ${MAX_ROWS_LIMIT}`);
    }

    // 1. Fetch current school data
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        classes: { select: { id: true, name: true } },
        students: {
          select: {
            id: true,
            admission_number: true,
            full_name: true,
            class_id: true,
            not_in_latest_upload: true,
            class: { select: { name: true } },
          },
        },
      },
    });

    if (!school) {
      throw new Error('School not found');
    }

    onProgress?.(10);

    const existingStudents = school.students.map((s) => ({
      admission_number: s.admission_number,
      full_name: s.full_name,
      class_name: s.class?.name || '',
    }));
    const existingClassNames = school.classes.map((c) => c.name);

    // Validate
    const validation = validateRosterRows(rows, existingStudents, existingClassNames);

    if (validation.errorCount > 0 && !skipBadRows) {
      throw new Error(`File contains ${validation.errorCount} error(s). Please review and correct them.`);
    }

    onProgress?.(25);

    // 2. Auto-create missing classes if enabled
    const classMap = new Map<string, string>();
    school.classes.forEach((c) => classMap.set(c.name.trim().toLowerCase(), c.id));

    if (createMissingClasses && validation.unknownClasses.length > 0) {
      for (const missingClass of validation.unknownClasses) {
        const created = await prisma.class.create({
          data: {
            school_id: schoolId,
            name: missingClass,
          },
        });
        classMap.set(missingClass.trim().toLowerCase(), created.id);
      }
    }

    onProgress?.(40);

    // 3. Process actionable rows
    const validRows = validation.rows.filter((r) => r.action !== 'ERROR');
    const existingByAdm = new Map(school.students.map((s) => [s.admission_number.trim().toUpperCase(), s]));

    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    const chunkSize = 200;
    const totalValid = validRows.length;

    for (let i = 0; i < totalValid; i += chunkSize) {
      const chunk = validRows.slice(i, i + chunkSize);

      await prisma.$transaction(async (tx) => {
        for (const row of chunk) {
          const admKey = row.admission_number.trim().toUpperCase();
          const targetClassId = classMap.get(row.class_name.trim().toLowerCase());

          if (!targetClassId) continue;

          const existing = existingByAdm.get(admKey);

          if (!existing) {
            await tx.student.create({
              data: {
                school_id: schoolId,
                admission_number: row.admission_number.trim(),
                full_name: row.full_name.trim(),
                class_id: targetClassId,
                status: 'ACTIVE',
                not_in_latest_upload: false,
              },
            });
            newCount++;
          } else if (row.action === 'UPDATE') {
            await tx.student.update({
              where: { id: existing.id },
              data: {
                full_name: row.full_name.trim(),
                class_id: targetClassId,
                status: 'ACTIVE',
                not_in_latest_upload: false,
              },
            });
            updatedCount++;
          } else {
            if (existing.not_in_latest_upload) {
              await tx.student.update({
                where: { id: existing.id },
                data: { not_in_latest_upload: false },
              });
            }
            unchangedCount++;
          }
        }
      });

      const chunkProgress = 40 + Math.round(((i + chunk.length) / totalValid) * 50);
      onProgress?.(Math.min(90, chunkProgress));
    }

    // 4. Handle complete list mode: flag unlisted students
    if (isCompleteList) {
      const uploadedAdmSet = new Set(validRows.map((r) => r.admission_number.trim().toUpperCase()));
      const unlistedStudentIds = school.students
        .filter((s) => !uploadedAdmSet.has(s.admission_number.trim().toUpperCase()))
        .map((s) => s.id);

      if (unlistedStudentIds.length > 0) {
        await prisma.student.updateMany({
          where: { id: { in: unlistedStudentIds } },
          data: { not_in_latest_upload: true },
        });
      }
    }

    // 5. Record StudentImport history
    const importRecord = await prisma.studentImport.create({
      data: {
        school_id: schoolId,
        user_id: userId || null,
        file_name: fileName,
        new_count: newCount,
        updated_count: updatedCount,
        unchanged_count: unchangedCount,
        error_count: validation.errorCount,
        total_count: rows.length,
      },
    });

    onProgress?.(100);

    return {
      importRecord,
      summary: {
        newCount,
        updatedCount,
        unchangedCount,
        errorCount: validation.errorCount,
        totalCount: rows.length,
      },
    };
  }
}
