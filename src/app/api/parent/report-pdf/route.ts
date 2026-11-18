// src/app/api/parent/report-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getParentSession } from '@/lib/auth/parentSession';
import PDFDocument from 'pdfkit';
import { logger } from '@/lib/logger';
import {
  checkPdfDownloadRateLimit,
  recordPdfDownload,
} from '@/modules/security/rateLimiter';
import {
  getCachedReportCard,
  setCachedReportCard,
} from '@/modules/cache/cacheService';

/**
 * GET /api/parent/report-pdf?termId=
 * Generates an official report card PDF for a student and term.
 */
export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';

    const session = await getParentSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Session expired or unauthenticated.' }, { status: 401 });
    }

    const rateIdentifier = `${ip}:${session.student_id}`;
    const rateCheck = checkPdfDownloadRateLimit(rateIdentifier);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: rateCheck.message || 'PDF download limit reached. Please wait before downloading another report card.' },
        { status: 429 }
      );
    }
    recordPdfDownload(rateIdentifier);

    const { student_id, school_id, pin_session, pin_term_number } = session;
    const url = new URL(request.url);
    const termId = url.searchParams.get('termId') || session.pin_term_id;

    // Verify term is published and not newer than the PIN's term
    const term = await prisma.term.findUnique({
      where: { id: termId },
    });

    if (!term || term.school_id !== school_id || term.status !== 'PUBLISHED') {
      return NextResponse.json({ error: 'Result not released or not found.' }, { status: 404 });
    }

    if (
      term.session > pin_session ||
      (term.session === pin_session && term.term_number > pin_term_number)
    ) {
      return NextResponse.json({ error: 'Access denied to future term results.' }, { status: 403 });
    }

    // Check if result is withheld
    const statusRecord = await prisma.studentTermStatus.findUnique({
      where: {
        student_id_term_id: { student_id, term_id: termId },
      },
    });
    if (statusRecord?.result_locked) {
      return NextResponse.json({ error: 'Result not released. Please contact the school.' }, { status: 403 });
    }

    // Fetch school, student, and results
    const [school, student, results] = await Promise.all([
      prisma.school.findUnique({
        where: { id: school_id },
        select: { name: true },
      }),
      prisma.student.findUnique({
        where: { id: student_id },
        select: {
          admission_number: true,
          full_name: true,
          class: { select: { name: true } },
        },
      }),
      prisma.result.findMany({
        where: {
          school_id,
          student_id,
          term_id: termId,
          status: 'SUBMITTED',
        },
        include: {
          subject: { select: { name: true } },
        },
        orderBy: { subject: { name: 'asc' } },
      }),
    ]);

    if (!school || !student) {
      return NextResponse.json({ error: 'Record not found.' }, { status: 404 });
    }

    // Check cache for pre-rendered PDF buffer
    const cachedPdf = getCachedReportCard<Buffer>(school_id, student_id, `${termId}:pdf`);
    if (cachedPdf) {
      return new NextResponse(new Uint8Array(cachedPdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="report-card-${student.admission_number.replace(/[^a-zA-Z0-9]/g, '_')}-term${term.term_number}.pdf"`,
          'X-Cache': 'HIT',
        },
      });
    }

    // Generate PDF
    const pdfBuffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Header
      doc.rect(40, 40, 515, 60).fillColor('#3F4E40').fill();
      doc.fillColor('#FFFFFF')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text(school.name.toUpperCase(), 40, 52, { align: 'center', width: 515 });

      doc.fontSize(10)
        .font('Helvetica')
        .text(`OFFICIAL REPORT CARD • TERM ${term.term_number} (${term.session})`, 40, 75, {
          align: 'center',
          width: 515,
        });

      // Student Meta Box
      doc.roundedRect(40, 115, 515, 55, 4)
        .lineWidth(1)
        .strokeColor('#D1CCC2')
        .fillColor('#FAF8F3')
        .fillAndStroke();

      doc.fillColor('#6B645D')
        .font('Helvetica')
        .fontSize(8)
        .text('STUDENT NAME:', 55, 125);
      doc.fillColor('#2C2825')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(student.full_name, 140, 124);

      doc.fillColor('#6B645D')
        .font('Helvetica')
        .fontSize(8)
        .text('ADMISSION NO:', 55, 145);
      doc.fillColor('#2C2825')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(student.admission_number, 140, 144);

      doc.fillColor('#6B645D')
        .font('Helvetica')
        .fontSize(8)
        .text('CLASS:', 350, 125);
      doc.fillColor('#2C2825')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(student.class?.name || 'General', 400, 124);

      // Results Table Header
      let y = 185;
      doc.rect(40, y, 515, 24).fillColor('#E9E4D9').fill();
      doc.fillColor('#2C2825').font('Helvetica-Bold').fontSize(8);
      doc.text('SUBJECT', 50, y + 8, { width: 180 });
      doc.text('CA (40)', 240, y + 8, { width: 50, align: 'center' });
      doc.text('EXAM (60)', 300, y + 8, { width: 60, align: 'center' });
      doc.text('TOTAL', 370, y + 8, { width: 50, align: 'center' });
      doc.text('GRADE', 430, y + 8, { width: 40, align: 'center' });
      doc.text('REMARK', 480, y + 8, { width: 70, align: 'left' });

      y += 24;
      let totalMarks = 0;
      let scoredSubjects = 0;

      results.forEach((r, idx) => {
        const bg = idx % 2 === 0 ? '#FFFFFF' : '#FAF8F3';
        doc.rect(40, y, 515, 20).fillColor(bg).fill();
        doc.fillColor('#2C2825').font('Helvetica').fontSize(8);

        doc.text(r.subject.name, 50, y + 6, { width: 180, ellipsis: true });
        doc.text(r.ca_score?.toString() || '-', 240, y + 6, { width: 50, align: 'center' });
        doc.text(r.exam_score?.toString() || '-', 300, y + 6, { width: 60, align: 'center' });

        doc.font('Helvetica-Bold');
        doc.text(r.total?.toString() || '-', 370, y + 6, { width: 50, align: 'center' });
        doc.text(r.grade || '-', 430, y + 6, { width: 40, align: 'center' });

        doc.font('Helvetica');
        doc.text(r.remark || '-', 480, y + 6, { width: 70, align: 'left', ellipsis: true });

        if (r.total) {
          totalMarks += Number(r.total);
          scoredSubjects += 1;
        }
        y += 20;
      });

      // Summary row
      y += 10;
      doc.roundedRect(40, y, 515, 35, 4)
        .lineWidth(1)
        .strokeColor('#BACBBF')
        .fillColor('#F2F6F3')
        .fillAndStroke();

      const average = scoredSubjects > 0 ? (totalMarks / scoredSubjects).toFixed(1) : '0';
      doc.fillColor('#3F4E40').font('Helvetica-Bold').fontSize(9);
      doc.text(`TOTAL SUBJECTS: ${scoredSubjects}`, 55, y + 12);
      doc.text(`AGGREGATE SCORE: ${totalMarks}`, 220, y + 12);
      doc.text(`AVERAGE: ${average}%`, 390, y + 12);

      // Footer
      doc.fillColor('#6B645D')
        .font('Helvetica')
        .fontSize(7)
        .text('Generated from Resulta School Platform. Authenticated via parent PIN session.', 40, 770, {
          align: 'center',
          width: 515,
        });

      doc.end();
    });

    // Cache the rendered PDF buffer
    setCachedReportCard(school_id, student_id, `${termId}:pdf`, pdfBuffer);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-card-${student.admission_number}-term${term.term_number}.pdf"`,
      },
    });
  } catch (e: unknown) {
    logger.error('[api/parent/report-pdf GET]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
