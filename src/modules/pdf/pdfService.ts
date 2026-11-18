// src/modules/pdf/pdfService.ts
import PDFDocument from 'pdfkit';
import { CardData, generatePinCardsPdf } from '@/lib/cards/generatePdf';

export interface ReportCardSubject {
  subject: string;
  ca_score: number | null;
  exam_score: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
}

export interface ReportCardData {
  schoolName: string;
  logoUrl?: string | null;
  studentName: string;
  admissionNumber: string;
  className: string;
  session: string;
  termNumber: number;
  subjects: ReportCardSubject[];
}

/**
 * PDF Service for generating student report cards and PIN cards.
 * Encapsulates all PDF rendering logic with clear boundaries so it can be split into a separate service if needed.
 */
export class PdfService {
  /**
   * Generates a single student report card PDF as a Buffer.
   */
  static async generateReportCardPdf(data: ReportCardData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `${data.schoolName} - Student Academic Report Card`,
            Author: 'Resulta Platform',
          },
        });

        const chunks: Buffer[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        // School Header
        doc
          .font('Helvetica-Bold')
          .fontSize(18)
          .text(data.schoolName.toUpperCase(), { align: 'center' });
        doc
          .font('Helvetica')
          .fontSize(11)
          .text('OFFICIAL ACADEMIC REPORT CARD', { align: 'center' });
        doc
          .fontSize(9)
          .text(`${data.session} Academic Session • Term ${data.termNumber}`, { align: 'center' });
        doc.moveDown(1.5);

        // Divider
        doc.strokeColor('#3F4E40').lineWidth(2).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(1);

        // Student Metadata Box
        const metaY = doc.y;
        doc
          .rect(40, metaY, 515, 50)
          .fillAndStroke('#F7F6F2', '#D1CCC2');

        doc.fillColor('#2C2825');
        doc.font('Helvetica-Bold').fontSize(10).text('Student Name:', 50, metaY + 10);
        doc.font('Helvetica').fontSize(10).text(data.studentName, 135, metaY + 10);

        doc.font('Helvetica-Bold').fontSize(10).text('Admission No:', 50, metaY + 28);
        doc.font('Helvetica').fontSize(10).text(data.admissionNumber, 135, metaY + 28);

        doc.font('Helvetica-Bold').fontSize(10).text('Class:', 350, metaY + 10);
        doc.font('Helvetica').fontSize(10).text(data.className, 400, metaY + 10);

        doc.font('Helvetica-Bold').fontSize(10).text('Term:', 350, metaY + 28);
        doc.font('Helvetica').fontSize(10).text(`Term ${data.termNumber}`, 400, metaY + 28);

        doc.y = metaY + 65;

        // Scores Table Header
        const tableTop = doc.y;
        doc.rect(40, tableTop, 515, 22).fill('#3F4E40');
        doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(9);
        doc.text('SUBJECT', 50, tableTop + 6, { width: 170 });
        doc.text('CA (40)', 225, tableTop + 6, { width: 50, align: 'center' });
        doc.text('EXAM (60)', 285, tableTop + 6, { width: 60, align: 'center' });
        doc.text('TOTAL', 355, tableTop + 6, { width: 45, align: 'center' });
        doc.text('GRADE', 410, tableTop + 6, { width: 45, align: 'center' });
        doc.text('REMARK', 465, tableTop + 6, { width: 80, align: 'left' });

        let currentY = tableTop + 22;
        let totalScore = 0;
        let subjectsCount = 0;

        data.subjects.forEach((subj, idx) => {
          const isEven = idx % 2 === 0;
          doc.rect(40, currentY, 515, 20).fill(isEven ? '#FFFFFF' : '#FAFAFA');
          doc.rect(40, currentY, 515, 20).strokeColor('#E9E4D9').lineWidth(0.5).stroke();

          doc.fillColor('#2C2825').font('Helvetica').fontSize(9);
          doc.text(subj.subject, 50, currentY + 5, { width: 170 });
          doc.text(subj.ca_score !== null ? String(subj.ca_score) : '-', 225, currentY + 5, { width: 50, align: 'center' });
          doc.text(subj.exam_score !== null ? String(subj.exam_score) : '-', 285, currentY + 5, { width: 60, align: 'center' });

          doc.font('Helvetica-Bold');
          doc.text(subj.total !== null ? String(subj.total) : '-', 355, currentY + 5, { width: 45, align: 'center' });
          doc.text(subj.grade || '-', 410, currentY + 5, { width: 45, align: 'center' });
          doc.font('Helvetica');
          doc.text(subj.remark || '-', 465, currentY + 5, { width: 80, align: 'left' });

          if (subj.total !== null) {
            totalScore += Number(subj.total);
            subjectsCount++;
          }
          currentY += 20;
        });

        // Summary Row
        currentY += 10;
        const avg = subjectsCount > 0 ? (totalScore / subjectsCount).toFixed(1) : 'N/A';
        doc.rect(40, currentY, 515, 25).fillAndStroke('#F2F6F3', '#BACBBF');
        doc.fillColor('#3F4E40').font('Helvetica-Bold').fontSize(10);
        doc.text(`Total Score: ${totalScore}   •   Average Score: ${avg}%   •   Subjects Offered: ${subjectsCount}`, 50, currentY + 8);

        // Footer / Verification Notice
        doc.moveDown(4);
        doc.strokeColor('#D1CCC2').lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(0.5);
        doc
          .font('Helvetica-Oblique')
          .fontSize(8)
          .fillColor('#6B645D')
          .text(
            'This official report card is generated by the Resulta School Management Platform. Verify with school administration if alterations are suspected.',
            { align: 'center' }
          );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generates print-ready PIN cards in 2x4 A4 sheets
   */
  static async generatePinCardsPdf(cards: CardData[]): Promise<Buffer> {
    return generatePinCardsPdf(cards);
  }
}
