// src/lib/timeout.ts
import { NextResponse } from 'next/server';

export class TimeoutError extends Error {
  constructor(message = 'Request execution timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wraps an asynchronous operation with a timeout guard.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 15000,
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  let timer: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
