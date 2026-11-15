import PDFDocument from 'pdfkit';

export interface CardData {
  schoolName: string;
  logoUrl?: string | null;
  studentName: string;
  admissionNumber: string;
  className: string;
  termName: string; // e.g. "Term 1"
  session: string;  // e.g. "2026/2027"
  pin: string;
  portalUrl: string;
}

/**
 * Generates a print-ready PDF buffer containing student PIN cards.
 * Laid out in a clean 2-column grid suitable for standard A4 paper printing.
 */
export async function generatePinCardsPdf(cards: CardData[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 30,
        info: {
          Title: 'Student Result PIN Cards',
          Author: 'Resulta Platform',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      const pageWidth = 595.28; // A4 pt width
      const pageHeight = 841.89; // A4 pt height
      const margin = 30;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      // 2 columns, 4 rows per page = 8 cards per page
      const cols = 2;
      const rows = 4;
      const cardWidth = (usableWidth - 20) / cols;
      const cardHeight = (usableHeight - 30) / rows;

      cards.forEach((card, index) => {
        const pageCardIndex = index % (cols * rows);
        if (index > 0 && pageCardIndex === 0) {
          doc.addPage();
        }

        const colIndex = pageCardIndex % cols;
        const rowIndex = Math.floor(pageCardIndex / cols);

        const x = margin + colIndex * (cardWidth + 20);
        const y = margin + rowIndex * (cardHeight + 10);

        // Card Border and Background
        doc.save();
        doc.roundedRect(x, y, cardWidth, cardHeight, 6)
          .lineWidth(1)
          .strokeColor('#D1CCC2')
          .fillColor('#FAF8F3')
          .fillAndStroke();

        // Top Header bar
        doc.roundedRect(x, y, cardWidth, 32, 6)
          .fillColor('#3F4E40')
          .fill();
        // Clean bottom corners of header
        doc.rect(x, y + 26, cardWidth, 6)
          .fillColor('#3F4E40')
          .fill();

        // School Name in Header
        doc.fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(card.schoolName.toUpperCase(), x + 8, y + 10, {
            width: cardWidth - 16,
            align: 'center',
            ellipsis: true,
          });

        // Subheader: Term & Session
        doc.fillColor('#6B645D')
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(`${card.termName} • ${card.session} SESSION`, x + 8, y + 38, {
            width: cardWidth - 16,
            align: 'center',
          });

        // Student Info Block
        let curY = y + 54;
        doc.font('Helvetica')
          .fontSize(8)
          .fillColor('#6B645D')
          .text('STUDENT:', x + 12, curY);

        doc.font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#2C2825')
          .text(card.studentName, x + 62, curY, { width: cardWidth - 76, ellipsis: true });

        curY += 15;
        doc.font('Helvetica')
          .fontSize(8)
          .fillColor('#6B645D')
          .text('ADM NO:', x + 12, curY);

        doc.font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#2C2825')
          .text(card.admissionNumber, x + 62, curY);

        curY += 15;
        doc.font('Helvetica')
          .fontSize(8)
          .fillColor('#6B645D')
          .text('CLASS:', x + 12, curY);

        doc.font('Helvetica-Bold')
          .fontSize(9)
          .fillColor('#2C2825')
          .text(card.className, x + 62, curY);

        // PIN Box
        curY += 18;
        doc.roundedRect(x + 12, curY, cardWidth - 24, 30, 4)
          .lineWidth(1)
          .strokeColor('#BACBBF')
          .fillColor('#FFFFFF')
          .fillAndStroke();

        doc.font('Helvetica')
          .fontSize(7)
          .fillColor('#3F4E40')
          .text('STUDENT RESULT ACCESS PIN', x + 12, curY + 4, {
            width: cardWidth - 24,
            align: 'center',
          });

        doc.font('Courier-Bold')
          .fontSize(12)
          .fillColor('#2C2825')
          .text(card.pin, x + 12, curY + 14, {
            width: cardWidth - 24,
            align: 'center',
            characterSpacing: 2,
          });

        // Instructions & Portal URL
        curY += 36;
        doc.font('Helvetica')
          .fontSize(6.5)
          .fillColor('#6B645D')
          .text(`Check online at: ${card.portalUrl}`, x + 8, curY, {
            width: cardWidth - 16,
            align: 'center',
          });

        doc.restore();
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
