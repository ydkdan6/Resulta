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
 * Pre-fetches and caches image buffers for school logos so PDFKit can render them directly.
 */
async function fetchLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    if (!logoUrl || typeof logoUrl !== 'string') return null;

    if (logoUrl.startsWith('data:')) {
      const parts = logoUrl.split(',');
      if (parts[1]) {
        return Buffer.from(parts[1], 'base64');
      }
    }

    if (logoUrl.startsWith('http://') || logoUrl.startsWith('https://')) {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        return Buffer.from(arrayBuf);
      }
    }

    if (logoUrl.startsWith('/')) {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const localPath = path.join(process.cwd(), 'public', logoUrl);
      if (fs.existsSync(localPath)) {
        return fs.readFileSync(localPath);
      }
    }

    return null;
  } catch (err) {
    // If logo fetch fails (e.g. timeout or offline), PDF generation gracefully falls back
    return null;
  }
}

/**
 * Renders an elegant fallback crest/badge when no image logo is supplied or loadable.
 */
function drawFallbackEmblem(
  doc: PDFKit.PDFDocument,
  schoolName: string,
  badgeX: number,
  badgeY: number,
  size: number
) {
  const radius = size / 2;
  const centerX = badgeX + radius;
  const centerY = badgeY + radius;

  // Background Circle
  doc.save();
  doc.circle(centerX, centerY, radius)
    .fillColor('#FFFFFF')
    .strokeColor('#D4AF37')
    .lineWidth(1)
    .fillAndStroke();

  // Inner subtle accent ring
  doc.circle(centerX, centerY, radius - 2)
    .strokeColor('#EADBB6')
    .lineWidth(0.5)
    .stroke();

  // Extract initials (e.g. "Greenfield Academy" -> "GA")
  const words = schoolName.trim().split(/\s+/).filter(Boolean);
  const initials = words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : (schoolName.slice(0, 2) || 'SCH').toUpperCase();

  doc.fillColor('#1E382B')
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(initials, badgeX, centerY - 5, {
      width: size,
      align: 'center',
    });

  doc.restore();
}

/**
 * Generates a print-ready PDF buffer containing student PIN cards.
 * Laid out in a clean 2-column, 4-row grid (8 cards per page) suitable for standard A4 paper printing.
 * Designed with a stylish, authentic academic scratch-card aesthetic with school logo/crest.
 */
export async function generatePinCardsPdf(cards: CardData[]): Promise<Buffer> {
  // Pre-fetch unique logos in parallel before PDFKit stream rendering
  const uniqueLogoUrls = Array.from(
    new Set(cards.map((c) => c.logoUrl).filter((u): u is string => Boolean(u)))
  );

  const logoBuffers = await Promise.all(
    uniqueLogoUrls.map(async (url) => {
      const buf = await fetchLogoBuffer(url);
      return [url, buf] as const;
    })
  );

  const logoMap = new Map<string, Buffer | null>(logoBuffers);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 28,
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
      const margin = 28;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      // 2 columns, 4 rows per page = 8 cards per page
      const cols = 2;
      const rows = 4;
      const colGap = 16;
      const rowGap = 10;
      const cardWidth = (usableWidth - colGap * (cols - 1)) / cols;
      const cardHeight = (usableHeight - rowGap * (rows - 1)) / rows;

      cards.forEach((card, index) => {
        const pageCardIndex = index % (cols * rows);
        if (index > 0 && pageCardIndex === 0) {
          doc.addPage();
        }

        const colIndex = pageCardIndex % cols;
        const rowIndex = Math.floor(pageCardIndex / cols);

        const x = margin + colIndex * (cardWidth + colGap);
        const y = margin + rowIndex * (cardHeight + rowGap);

        doc.save();

        // 1. OUTER CARD CONTAINER & SUBTLE LUXURY BORDER
        doc.roundedRect(x, y, cardWidth, cardHeight, 7)
          .lineWidth(1)
          .strokeColor('#C8BFB0')
          .fillColor('#FCFAF6')
          .fillAndStroke();

        // Inner security hairline frame
        doc.roundedRect(x + 3, y + 3, cardWidth - 6, cardHeight - 6, 5)
          .lineWidth(0.5)
          .strokeColor('#E9E2D5')
          .stroke();

        // Corner security dots
        const cornerInset = 6;
        doc.fillColor('#D4AF37');
        doc.circle(x + cornerInset, y + cornerInset, 1.2).fill();
        doc.circle(x + cardWidth - cornerInset, y + cornerInset, 1.2).fill();
        doc.circle(x + cornerInset, y + cardHeight - cornerInset, 1.2).fill();
        doc.circle(x + cardWidth - cornerInset, y + cardHeight - cornerInset, 1.2).fill();

        // 2. HEADER BANNER (Deep Emerald + Gold Trim)
        const headerHeight = 42;
        doc.roundedRect(x, y, cardWidth, headerHeight, 7)
          .fillColor('#1B382B')
          .fill();

        // Square the bottom corners of the header
        doc.rect(x, y + headerHeight - 8, cardWidth, 8)
          .fillColor('#1B382B')
          .fill();

        // Polished Gold Accent Strip
        doc.rect(x, y + headerHeight, cardWidth, 2)
          .fillColor('#D4AF37')
          .fill();

        // 3. SCHOOL LOGO / CREST
        const logoSize = 30;
        const logoX = x + 8;
        const logoY = y + 6;

        let hasDrawnLogo = false;
        const logoBuffer = card.logoUrl ? logoMap.get(card.logoUrl) : null;

        if (logoBuffer) {
          try {
            // White circular badge backing for crisp logo presentation
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2)
              .fillColor('#FFFFFF')
              .strokeColor('#D4AF37')
              .lineWidth(1)
              .fillAndStroke();

            doc.save();
            // Clip to circle so non-circular images conform cleanly
            doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 - 1).clip();
            doc.image(logoBuffer, logoX + 1.5, logoY + 1.5, {
              fit: [logoSize - 3, logoSize - 3],
              align: 'center',
              valign: 'center',
            });
            doc.restore();
            hasDrawnLogo = true;
          } catch {
            hasDrawnLogo = false;
          }
        }

        if (!hasDrawnLogo) {
          drawFallbackEmblem(doc, card.schoolName, logoX, logoY, logoSize);
        }

        // 4. SCHOOL NAME & BADGE TEXT
        const textStartX = x + 44;
        const textWidth = cardWidth - 50;

        doc.fillColor('#FFFFFF')
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .text(card.schoolName.toUpperCase(), textStartX, y + 8, {
            width: textWidth,
            ellipsis: true,
          });

        doc.fillColor('#E5D3A3')
          .font('Helvetica-Bold')
          .fontSize(6)
          .text('OFFICIAL RESULT ACCESS CARD', textStartX, y + 23, {
            width: textWidth,
            characterSpacing: 0.5,
          });

        // 5. SESSION & TERM SUBHEADER RIBBON
        const ribbonY = y + 48;
        const ribbonHeight = 14;
        doc.roundedRect(x + 8, ribbonY, cardWidth - 16, ribbonHeight, 3)
          .lineWidth(0.5)
          .strokeColor('#DDD4C4')
          .fillColor('#F2ECE1')
          .fillAndStroke();

        doc.fillColor('#433D35')
          .font('Helvetica-Bold')
          .fontSize(6.5)
          .text(`● ${card.termName.toUpperCase()} • ${card.session} ACADEMIC SESSION ●`, x + 8, ribbonY + 3.5, {
            width: cardWidth - 16,
            align: 'center',
          });

        // 6. STUDENT INFORMATION SECTION
        const infoY = y + 67;

        // Student Name Row
        doc.font('Helvetica')
          .fontSize(6.5)
          .fillColor('#7A7167')
          .text('STUDENT:', x + 10, infoY);

        doc.font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor('#1F2421')
          .text(card.studentName, x + 50, infoY, {
            width: cardWidth - 62,
            ellipsis: true,
          });

        // Admission Number & Class Row
        const row2Y = infoY + 13;
        doc.font('Helvetica')
          .fontSize(6.5)
          .fillColor('#7A7167')
          .text('ADM NO:', x + 10, row2Y);

        doc.font('Courier-Bold')
          .fontSize(8.5)
          .fillColor('#1B382B')
          .text(card.admissionNumber, x + 50, row2Y, {
            width: 80,
            ellipsis: true,
          });

        doc.font('Helvetica')
          .fontSize(6.5)
          .fillColor('#7A7167')
          .text('CLASS:', x + 138, row2Y);

        doc.font('Helvetica-Bold')
          .fontSize(8.5)
          .fillColor('#1F2421')
          .text(card.className, x + 172, row2Y, {
            width: cardWidth - 182,
            ellipsis: true,
          });

        // 7. PIN SCRATCH / ACCESS TOKEN PANEL
        const pinBoxY = y + 98;
        const pinBoxHeight = 44;

        // Background of PIN token box with security tint
        doc.roundedRect(x + 8, pinBoxY, cardWidth - 16, pinBoxHeight, 4)
          .lineWidth(1)
          .dash(3, { space: 2.5 })
          .strokeColor('#88A992')
          .fillColor('#F0F6F2')
          .fillAndStroke();

        doc.undash(); // Reset dash for regular lines

        // Security Header Ribbon in PIN box
        doc.font('Helvetica-Bold')
          .fontSize(6)
          .fillColor('#265239')
          .text('★ SECURE RESULT CHECKER PIN ★', x + 8, pinBoxY + 4, {
            width: cardWidth - 16,
            align: 'center',
            characterSpacing: 0.8,
          });

        // Inner White Scratch Panel
        const scratchBoxY = pinBoxY + 14;
        doc.roundedRect(x + 16, scratchBoxY, cardWidth - 32, 17, 3)
          .lineWidth(0.5)
          .strokeColor('#B8D3C2')
          .fillColor('#FFFFFF')
          .fillAndStroke();

        // 10-Character PIN Code (Crisp Monospace with spacing)
        doc.font('Courier-Bold')
          .fontSize(12)
          .fillColor('#0E3320')
          .text(card.pin, x + 16, scratchBoxY + 3.5, {
            width: cardWidth - 32,
            align: 'center',
            characterSpacing: 2.5,
          });

        // PIN Security Caption
        doc.font('Helvetica')
          .fontSize(5.5)
          .fillColor('#50735E')
          .text('Valid for 1 Student • Maximum 10 Online Logins', x + 8, pinBoxY + 34, {
            width: cardWidth - 16,
            align: 'center',
          });

        // 8. VERIFICATION INSTRUCTIONS & FOOTER
        const footY = y + 148;

        // Subtle divider
        doc.strokeColor('#E2D9CB')
          .lineWidth(0.5)
          .moveTo(x + 10, footY)
          .lineTo(x + cardWidth - 10, footY)
          .stroke();

        // Portal link
        doc.font('Helvetica')
          .fontSize(6)
          .fillColor('#615950')
          .text('Portal: ', x + 10, footY + 4, { continued: true });

        doc.font('Helvetica-Bold')
          .fontSize(6)
          .fillColor('#1B382B')
          .text(card.portalUrl, { underline: true });

        // 3-Step Quick Guide
        doc.font('Helvetica')
          .fontSize(5.2)
          .fillColor('#7A7268')
          .text('1. Visit portal   ▸   2. Enter Adm No & PIN   ▸   3. View & Print Report', x + 8, footY + 14, {
            width: cardWidth - 16,
            align: 'center',
          });

        // Anti-Fraud Notice
        doc.font('Helvetica-Bold')
          .fontSize(4.5)
          .fillColor('#9C9488')
          .text('RESULTA VERIFIED ACCESS TOKEN • KEEP CONFIDENTIAL', x + 8, footY + 23, {
            width: cardWidth - 16,
            align: 'center',
            characterSpacing: 0.3,
          });

        doc.restore();
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
