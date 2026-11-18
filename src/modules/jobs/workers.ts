// src/modules/jobs/workers.ts
import { jobQueue } from './jobQueue';
import { RosterService, type ImportRosterOptions } from '@/modules/students/rosterService';
import { PinService, type GeneratePinsInput } from '@/modules/pins/pinService';
import { PdfService, type ReportCardData } from '@/modules/pdf/pdfService';
import type { CardData } from '@/lib/cards/generatePdf';
import { logger } from '@/lib/logger';

/**
 * Register all background workers with the central job queue.
 */
export function initializeJobWorkers() {
  // 1. Roster Import Worker (CSV & Excel)
  jobQueue.registerHandler('ROSTER_IMPORT', async (job, updateProgress) => {
    logger.info(`[Worker] Starting ROSTER_IMPORT job ${job.id}`);
    const payload = job.payload as ImportRosterOptions;
    const result = await RosterService.importRoster({
      ...payload,
      onProgress: updateProgress,
    });
    return result;
  });

  // 2. PIN Generation Worker
  jobQueue.registerHandler('PIN_GENERATION', async (job, updateProgress) => {
    logger.info(`[Worker] Starting PIN_GENERATION job ${job.id}`);
    const payload = job.payload as GeneratePinsInput;
    const result = await PinService.generatePins({
      ...payload,
      onProgress: updateProgress,
    });
    return result;
  });

  // 3. Report Card PDF Worker
  jobQueue.registerHandler('REPORT_CARD_PDF', async (job, updateProgress) => {
    logger.info(`[Worker] Starting REPORT_CARD_PDF job ${job.id}`);
    updateProgress(20);
    const pdfBuffer = await PdfService.generateReportCardPdf(job.payload as ReportCardData);
    updateProgress(100);
    // Store as base64 string in result so it can be transmitted or serialized
    return {
      pdfBase64: pdfBuffer.toString('base64'),
      size: pdfBuffer.length,
      mimeType: 'application/pdf',
    };
  });

  // 4. PIN Cards PDF Worker
  jobQueue.registerHandler('PIN_CARDS_PDF', async (job, updateProgress) => {
    logger.info(`[Worker] Starting PIN_CARDS_PDF job ${job.id}`);
    updateProgress(20);
    const payload = job.payload as { cards: CardData[]; filename?: string };
    const pdfBuffer = await PdfService.generatePinCardsPdf(payload.cards);
    updateProgress(100);
    return {
      pdfBase64: pdfBuffer.toString('base64'),
      size: pdfBuffer.length,
      mimeType: 'application/pdf',
      filename: payload.filename || 'pin-cards.pdf',
    };
  });

  // 5. Print PDF Worker
  jobQueue.registerHandler('PRINT_PDF', async (job, updateProgress) => {
    logger.info(`[Worker] Starting PRINT_PDF job ${job.id}`);
    updateProgress(30);
    const payload = job.payload as { cards: CardData[] };
    const pdfBuffer = await PdfService.generatePinCardsPdf(payload.cards);
    updateProgress(100);
    return {
      pdfBase64: pdfBuffer.toString('base64'),
      size: pdfBuffer.length,
      mimeType: 'application/pdf',
    };
  });
}

// Auto-initialize workers on load
initializeJobWorkers();
