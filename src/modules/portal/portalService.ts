// src/modules/portal/portalService.ts
import { prisma } from '@/lib/prisma';
import { verifyPin } from '@/lib/auth/pin';
import { createParentSessionToken } from '@/lib/auth/parentSession';
import {
  checkParentLoginRateLimit,
  recordParentLoginFailure,
  resetParentLoginAttempts,
  checkComplaintRateLimit,
  recordComplaintSubmission,
} from '@/modules/security/rateLimiter';
import { getCachedSchoolBranding, getCachedReportCard, setCachedReportCard } from '@/modules/cache/cacheService';

export class PortalService {
  /**
   * Authenticates parent with admission number and PIN, handling rate limits & login limits.
   */
  static async login(ip: string, schoolSlug: string, admissionNumber: string, pin: string) {
    // 1. Rate limiting
    const rateCheck = checkParentLoginRateLimit(ip, admissionNumber);
    if (rateCheck.locked) {
      return {
        success: false,
        statusCode: 429,
        error: rateCheck.message || `Too many failed attempts. Temporary lockout in effect for ${rateCheck.remainingLockoutSeconds}s.`,
      };
    }

    // 2. Resolve school
    let school = await getCachedSchoolBranding(schoolSlug);
    if (!school) {
      school = await prisma.school.findUnique({
        where: { slug: schoolSlug.toLowerCase() },
        select: { id: true, name: true, slug: true, logo_url: true },
      });
    }

    if (!school) {
      return { success: false, statusCode: 401, error: 'Invalid admission number or PIN.' };
    }

    // 3. Find student
    const student = await prisma.student.findFirst({
      where: {
        school_id: school.id,
        admission_number: admissionNumber.trim(),
      },
      select: {
        id: true,
        school_id: true,
        admission_number: true,
        full_name: true,
        status: true,
      },
    });

    if (!student) {
      recordParentLoginFailure(ip, admissionNumber);
      return { success: false, statusCode: 401, error: 'Invalid admission number or PIN.' };
    }

    // 4. Find student's PINs
    const pins = await prisma.pin.findMany({
      where: {
        student_id: student.id,
        school_id: school.id,
      },
      include: {
        term: {
          select: { id: true, session: true, term_number: true },
        },
      },
      orderBy: { generated_at: 'desc' },
    });

    let matchedPin = null;
    let expiredPinMatched = false;

    for (const p of pins) {
      if (verifyPin(pin, p.pin_hash)) {
        if (p.status === 'EXPIRED') {
          expiredPinMatched = true;
          break;
        }
        if (p.status === 'ACTIVE') {
          matchedPin = p;
          break;
        }
      }
    }

    if (expiredPinMatched) {
      return {
        success: false,
        statusCode: 401,
        error: "This card has expired. Please use the current term's card.",
      };
    }

    if (!matchedPin) {
      recordParentLoginFailure(ip, admissionNumber);
      return { success: false, statusCode: 401, error: 'Invalid admission number or PIN.' };
    }

    // Check login count limit
    if (matchedPin.logins_used >= matchedPin.max_logins) {
      return {
        success: false,
        statusCode: 401,
        error: `This card has reached its login limit (${matchedPin.max_logins} uses). Please contact the school.`,
      };
    }

    // Check withhold status
    const termStatus = await prisma.studentTermStatus.findUnique({
      where: {
        student_id_term_id: {
          student_id: student.id,
          term_id: matchedPin.term_id,
        },
      },
      select: { result_locked: true },
    });

    if (termStatus?.result_locked) {
      return {
        success: false,
        statusCode: 403,
        error: 'Result not released. Please contact the school.',
      };
    }

    // Increment login counter
    await prisma.pin.update({
      where: { id: matchedPin.id },
      data: { logins_used: { increment: 1 } },
    });

    // Reset rate limiter on success
    resetParentLoginAttempts(ip, admissionNumber);

    // Create session token
    const token = await createParentSessionToken({
      student_id: student.id,
      school_id: school.id,
      school_slug: school.slug,
      admission_number: student.admission_number,
      full_name: student.full_name,
      pin_id: matchedPin.id,
      pin_term_id: matchedPin.term.id,
      pin_session: matchedPin.term.session,
      pin_term_number: matchedPin.term.term_number,
    });

    return {
      success: true,
      token,
      student: {
        admission_number: student.admission_number,
        full_name: student.full_name,
      },
      term: matchedPin.term,
    };
  }

  /**
   * Submits a parent complaint with rate limiting.
   */
  static async submitComplaint(ip: string, schoolSlug: string, admissionNumber: string, message: string, termId?: string) {
    const rateCheck = checkComplaintRateLimit(ip);
    if (!rateCheck.allowed) {
      return {
        success: false,
        statusCode: 429,
        error: rateCheck.message || 'Complaint rate limit reached. Please wait before submitting another report.',
      };
    }

    const school = await prisma.school.findUnique({
      where: { slug: schoolSlug.trim() },
      select: { id: true },
    });
    if (!school) {
      return { success: false, statusCode: 404, error: 'School not found.' };
    }

    const student = await prisma.student.findFirst({
      where: {
        school_id: school.id,
        admission_number: admissionNumber.trim(),
      },
      select: { id: true },
    });
    if (!student) {
      return {
        success: false,
        statusCode: 404,
        error: 'Student with this admission number was not found in the school.',
      };
    }

    let resolvedTermId = termId?.trim() || null;
    if (!resolvedTermId) {
      const latestTerm = await prisma.term.findFirst({
        where: { school_id: school.id },
        orderBy: [{ session: 'desc' }, { term_number: 'desc' }],
        select: { id: true },
      });
      if (!latestTerm) {
        return { success: false, statusCode: 404, error: 'No term found for this school.' };
      }
      resolvedTermId = latestTerm.id;
    }

    const complaint = await prisma.complaint.create({
      data: {
        school_id: school.id,
        student_id: student.id,
        term_id: resolvedTermId,
        message: message.trim(),
        status: 'PENDING',
      },
    });

    recordComplaintSubmission(ip);

    return {
      success: true,
      statusCode: 201,
      complaint_id: complaint.id,
    };
  }
}
