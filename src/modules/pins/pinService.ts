// src/modules/pins/pinService.ts
import { prisma } from '@/lib/prisma';
import { generateRandomPin, hashPin, verifyPin } from '@/lib/auth/pin';
import { CardData } from '@/lib/cards/generatePdf';
import { platformConfig } from '@/lib/config';

export interface GeneratePinsInput {
  schoolId: string;
  termId: string;
  studentIds?: string[];
  batchId?: string;
  maxLogins?: number;
  onProgress?: (percent: number) => void;
}

export class PinService {
  /**
   * Generates PINs for eligible paid students in a confirmed batch.
   * Expires previous term's PINs.
   * Can be run directly or inside a background queue worker.
   */
  static async generatePins(input: GeneratePinsInput): Promise<{
    cards: CardData[];
    count: number;
    ineligible: { admission_number: string; reason: string }[];
  }> {
    const { schoolId, termId, studentIds, batchId, maxLogins = 10, onProgress } = input;

    onProgress?.(5);

    // 1. Verify confirmed batch
    const confirmedBatch = await prisma.paymentBatch.findFirst({
      where: {
        school_id: schoolId,
        term_id: termId,
        status: 'CONFIRMED',
        ...(batchId ? { id: batchId } : {}),
      },
    });

    if (!confirmedBatch) {
      throw new Error('PIN generation is impossible without a confirmed payment batch. The platform administrator must confirm payment received first.');
    }

    // 2. Fetch school and term
    const [school, term] = await Promise.all([
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true, name: true, slug: true, logo_url: true },
      }),
      prisma.term.findUnique({
        where: { id: termId },
        select: { id: true, session: true, term_number: true },
      }),
    ]);

    if (!school || !term) {
      throw new Error('School or term not found');
    }

    onProgress?.(15);

    // 3. Resolve target students
    let targetStudentIds: string[] = [];
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      targetStudentIds = studentIds;
    } else {
      const paidStatuses = await prisma.studentTermStatus.findMany({
        where: {
          school_id: schoolId,
          term_id: termId,
          fees_paid: true,
          result_locked: false,
        },
        select: { student_id: true },
      });
      targetStudentIds = paidStatuses.map((s) => s.student_id);
    }

    if (targetStudentIds.length === 0) {
      throw new Error('No paid students found to generate PINs for.');
    }

    const students = await prisma.student.findMany({
      where: {
        id: { in: targetStudentIds },
        school_id: schoolId,
      },
      select: {
        id: true,
        admission_number: true,
        full_name: true,
        class: { select: { id: true, name: true } },
        termStatuses: {
          where: { term_id: termId },
          select: { fees_paid: true, result_locked: true },
        },
      },
    });

    const ineligible: { admission_number: string; reason: string }[] = [];
    const eligibleStudents: typeof students = [];

    for (const student of students) {
      const termStatus = student.termStatuses[0];
      if (!termStatus || !termStatus.fees_paid) {
        ineligible.push({
          admission_number: student.admission_number,
          reason: 'Fees not marked as paid for this term.',
        });
      } else if (termStatus.result_locked) {
        ineligible.push({
          admission_number: student.admission_number,
          reason: 'Result is withheld (locked) by administration.',
        });
      } else {
        eligibleStudents.push(student);
      }
    }

    if (eligibleStudents.length === 0) {
      return { cards: [], count: 0, ineligible };
    }

    onProgress?.(30);

    // 4. Expire earlier terms' PINs for these eligible students
    const eligibleStudentIds = eligibleStudents.map((s) => s.id);
    await prisma.pin.updateMany({
      where: {
        school_id: schoolId,
        student_id: { in: eligibleStudentIds },
        term_id: { not: termId },
        status: 'ACTIVE',
      },
      data: { status: 'EXPIRED' },
    });

    onProgress?.(45);

    // 5. Generate PINs, hash with bcrypt, create CardData
    const cards: CardData[] = [];
    const portalUrl = platformConfig.getSchoolResultsUrl(school.slug);
    const totalEligible = eligibleStudents.length;

    for (let i = 0; i < totalEligible; i++) {
      const student = eligibleStudents[i];
      const plainPin = generateRandomPin();
      const pinHash = hashPin(plainPin);

      // Deactivate any existing PIN for this term
      await prisma.pin.updateMany({
        where: {
          school_id: schoolId,
          student_id: student.id,
          term_id: termId,
          status: 'ACTIVE',
        },
        data: { status: 'REVOKED' },
      });

      // Create new PIN record
      await prisma.pin.create({
        data: {
          school_id: schoolId,
          student_id: student.id,
          term_id: termId,
          pin_hash: pinHash,
          max_logins: maxLogins,
          status: 'ACTIVE',
        },
      });

      cards.push({
        schoolName: school.name,
        logoUrl: school.logo_url,
        studentName: student.full_name,
        admissionNumber: student.admission_number,
        className: student.class?.name || 'Class',
        termName: `Term ${term.term_number}`,
        session: term.session,
        pin: plainPin,
        portalUrl,
      });

      if (i % 20 === 0 || i === totalEligible - 1) {
        const percent = 45 + Math.round(((i + 1) / totalEligible) * 50);
        onProgress?.(Math.min(95, percent));
      }
    }

    onProgress?.(100);

    return {
      cards,
      count: cards.length,
      ineligible,
    };
  }

  /**
   * Single-card reprint with audit trail
   */
  static async reprintPin(options: {
    schoolId: string;
    userId: string;
    studentId: string;
    termId: string;
    reason: string;
  }): Promise<{ card: CardData; plainPin: string }> {
    const { schoolId, userId, studentId, termId, reason } = options;

    if (!reason || reason.trim().length < 5) {
      throw new Error('A detailed reason (at least 5 characters) is required to reprint a PIN.');
    }

    const [student, term, school] = await Promise.all([
      prisma.student.findUnique({
        where: { id: studentId },
        select: {
          id: true,
          school_id: true,
          admission_number: true,
          full_name: true,
          class: { select: { name: true } },
          termStatuses: {
            where: { term_id: termId },
            select: { fees_paid: true, result_locked: true },
          },
        },
      }),
      prisma.term.findUnique({
        where: { id: termId },
        select: { id: true, school_id: true, session: true, term_number: true },
      }),
      prisma.school.findUnique({
        where: { id: schoolId },
        select: { id: true, name: true, slug: true, logo_url: true },
      }),
    ]);

    if (!student || student.school_id !== schoolId) {
      throw new Error('Student not found in your school.');
    }
    if (!term || term.school_id !== schoolId) {
      throw new Error('Term not found for your school.');
    }
    if (!school) {
      throw new Error('School not found.');
    }

    const termStatus = student.termStatuses[0];
    if (!termStatus || !termStatus.fees_paid) {
      throw new Error('Student fees are not marked as paid for this term.');
    }
    if (termStatus.result_locked) {
      throw new Error('Student results are currently withheld (locked). Cannot reprint PIN.');
    }

    const plainPin = generateRandomPin();
    const pinHash = hashPin(plainPin);

    // Atomic update
    await prisma.$transaction(async (tx) => {
      // Revoke older active pins for this student and term
      await tx.pin.updateMany({
        where: {
          school_id: schoolId,
          student_id: studentId,
          term_id: termId,
          status: 'ACTIVE',
        },
        data: { status: 'REVOKED' },
      });

      // Create replacement pin
      await tx.pin.create({
        data: {
          school_id: schoolId,
          student_id: studentId,
          term_id: termId,
          pin_hash: pinHash,
          max_logins: 10,
          status: 'ACTIVE',
        },
      });

      // Audit log entry
      await tx.auditLog.create({
        data: {
          school_id: schoolId,
          user_id: userId,
          action: 'PIN_REPRINT',
          entity: 'Pin',
          entity_id: studentId,
          reason: reason.trim(),
          new_values: {
            student_id: studentId,
            admission_number: student.admission_number,
            term_id: termId,
            reason: reason.trim(),
          },
        },
      });
    });

    const portalUrl = platformConfig.getSchoolResultsUrl(school.slug);
    const card: CardData = {
      schoolName: school.name,
      logoUrl: school.logo_url,
      studentName: student.full_name,
      admissionNumber: student.admission_number,
      className: student.class?.name || 'Class',
      termName: `Term ${term.term_number}`,
      session: term.session,
      pin: plainPin,
      portalUrl,
    };

    return { card, plainPin };
  }
}
