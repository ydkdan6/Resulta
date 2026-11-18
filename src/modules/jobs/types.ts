// src/modules/jobs/types.ts

export type JobType =
  | 'ROSTER_IMPORT'
  | 'PIN_GENERATION'
  | 'REPORT_CARD_PDF'
  | 'PIN_CARDS_PDF'
  | 'PRINT_PDF';

export type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface Job<TPayload = any, TResult = any> {
  id: string;
  type: JobType;
  schoolId?: string;
  userId?: string;
  payload: TPayload;
  status: JobStatus;
  progress: number; // 0 - 100
  result?: TResult;
  error?: string;
  attempts: number;
  maxRetries: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
}

export interface EnqueueOptions {
  schoolId?: string;
  userId?: string;
  maxRetries?: number;
}
