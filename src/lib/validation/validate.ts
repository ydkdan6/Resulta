// src/lib/validation/validate.ts
import { z } from 'zod';
import { NextResponse } from 'next/server';

/**
 * Validates request data with a Zod schema.
 * Returns either `{ success: true, data }` or `{ success: false, response }`
 * with a clean 400 Bad Request error response.
 */
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; response: NextResponse } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const message = firstIssue?.message || 'Invalid request parameters.';
    return {
      success: false,
      response: NextResponse.json(
        {
          error: message,
          issues: result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 }
      ),
    };
  }
  return { success: true, data: result.data };
}
