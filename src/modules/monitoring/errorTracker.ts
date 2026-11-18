// src/modules/monitoring/errorTracker.ts
import { sanitizeData } from '@/lib/logger';

export interface ErrorReport {
  id: string;
  timestamp: string;
  message: string;
  name: string;
  stack?: string;
  context?: Record<string, unknown>;
  handled: boolean;
}

class ErrorTracker {
  private reports: ErrorReport[] = [];
  private maxReports = 100;
  private errorCountsByHour = new Map<string, number>();

  /**
   * Capture and record an application error with sanitization.
   */
  captureException(error: unknown, context?: Record<string, unknown>): ErrorReport {
    const err = error instanceof Error ? error : new Error(String(error));
    const now = new Date();
    const hourKey = `${now.toISOString().slice(0, 13)}:00`;

    this.errorCountsByHour.set(hourKey, (this.errorCountsByHour.get(hourKey) || 0) + 1);

    const report: ErrorReport = {
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now.toISOString(),
      name: err.name || 'Error',
      message: sanitizeData(err.message),
      stack: process.env.NODE_ENV !== 'production' ? sanitizeData(err.stack) : undefined,
      context: context ? sanitizeData(context) : undefined,
      handled: true,
    };

    this.reports.unshift(report);
    if (this.reports.length > this.maxReports) {
      this.reports.pop();
    }

    return report;
  }

  /**
   * Get recent error history for platform administration / health diagnostics
   */
  getRecentErrors(limit = 20): ErrorReport[] {
    return this.reports.slice(0, limit);
  }

  /**
   * Get error frequency statistics
   */
  getStats() {
    return {
      totalTracked: this.reports.length,
      hourlyBreakdown: Object.fromEntries(this.errorCountsByHour.entries()),
    };
  }

  clear() {
    this.reports = [];
    this.errorCountsByHour.clear();
  }
}

export const errorTracker = new ErrorTracker();
