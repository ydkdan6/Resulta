// src/modules/jobs/jobQueue.ts
import { Job, JobType, JobStatus, EnqueueOptions } from './types';
import { logger } from '@/lib/logger';

export type JobHandler<TPayload = any, TResult = any> = (
  job: Job<TPayload, TResult>,
  updateProgress: (percent: number) => void
) => Promise<TResult>;

class JobQueue {
  private jobs = new Map<string, Job>();
  private queue: string[] = [];
  private handlers = new Map<JobType, JobHandler>();
  private activeCount = 0;
  private maxConcurrency = 4;
  private isProcessing = false;

  constructor(maxConcurrency = 4) {
    this.maxConcurrency = maxConcurrency;
  }

  /**
   * Register a worker handler for a specific job type
   */
  registerHandler<TPayload, TResult>(
    type: JobType,
    handler: JobHandler<TPayload, TResult>
  ) {
    this.handlers.set(type, handler);
  }

  /**
   * Enqueue a new background job
   */
  enqueue<TPayload, TResult>(
    type: JobType,
    payload: TPayload,
    options: EnqueueOptions = {}
  ): Job<TPayload, TResult> {
    const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const job: Job<TPayload, TResult> = {
      id,
      type,
      schoolId: options.schoolId,
      userId: options.userId,
      payload,
      status: 'PENDING',
      progress: 0,
      attempts: 0,
      maxRetries: options.maxRetries ?? 3,
      createdAt: Date.now(),
    };

    this.jobs.set(id, job);
    this.queue.push(id);
    this.processNext();

    return job;
  }

  /**
   * Get job status and results
   */
  getJob(id: string): Job | null {
    return this.jobs.get(id) || null;
  }

  /**
   * Cancel a pending job
   */
  cancelJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') {
      return false;
    }
    job.status = 'CANCELLED';
    this.queue = this.queue.filter((jobId) => jobId !== id);
    return true;
  }

  /**
   * Process next jobs from the queue with concurrency limit and exponential retries
   */
  private async processNext() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.activeCount < this.maxConcurrency && this.queue.length > 0) {
        const jobId = this.queue.shift();
        if (!jobId) break;

        const job = this.jobs.get(jobId);
        if (!job || job.status === 'CANCELLED') continue;

        this.activeCount++;
        this.runJob(job).finally(() => {
          this.activeCount--;
          this.processNext();
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute an individual job with retries and exponential backoff
   */
  private async runJob(job: Job) {
    const handler = this.handlers.get(job.type);
    if (!handler) {
      job.status = 'FAILED';
      job.error = `No handler registered for job type ${job.type}`;
      job.failedAt = Date.now();
      return;
    }

    job.status = 'PROCESSING';
    job.startedAt = Date.now();
    job.attempts += 1;

    const updateProgress = (percent: number) => {
      job.progress = Math.min(100, Math.max(0, Math.round(percent)));
    };

    try {
      const result = await handler(job, updateProgress);
      job.status = 'COMPLETED';
      job.progress = 100;
      job.result = result;
      job.completedAt = Date.now();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[JobQueue] Job ${job.id} (${job.type}) failed on attempt ${job.attempts}`, err);

      if (job.attempts < job.maxRetries) {
        // Exponential backoff: 1s, 2s, 4s...
        const backoffMs = Math.pow(2, job.attempts - 1) * 1000;
        logger.info(`[JobQueue] Retrying job ${job.id} in ${backoffMs}ms`);
        job.status = 'PENDING';
        job.progress = 0;
        setTimeout(() => {
          this.queue.push(job.id);
          this.processNext();
        }, backoffMs);
      } else {
        job.status = 'FAILED';
        job.error = errorMessage;
        job.failedAt = Date.now();
      }
    }
  }

  /**
   * Health metrics for monitoring
   */
  getMetrics() {
    let pending = 0;
    let processing = 0;
    let completed = 0;
    let failed = 0;

    for (const job of this.jobs.values()) {
      if (job.status === 'PENDING') pending++;
      else if (job.status === 'PROCESSING') processing++;
      else if (job.status === 'COMPLETED') completed++;
      else if (job.status === 'FAILED') failed++;
    }

    return {
      activeWorkers: this.activeCount,
      maxConcurrency: this.maxConcurrency,
      queueLength: this.queue.length,
      pending,
      processing,
      completed,
      failed,
      totalTracked: this.jobs.size,
    };
  }

  /**
   * Clean old completed or failed jobs after retention period
   */
  cleanupOldJobs(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [id, job] of this.jobs.entries()) {
      const finishedAt = job.completedAt || job.failedAt;
      if (finishedAt && now - finishedAt > maxAgeMs) {
        this.jobs.delete(id);
      }
    }
  }
}

// Global job queue singleton
export const jobQueue = new JobQueue(4);
