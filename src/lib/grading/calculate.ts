// src/lib/grading/calculate.ts
import type { Boundary, Part } from "@/lib/validation/gradingScheme";

export interface SchemeData {
  parts: Part[];
  boundaries: Boundary[];
}

export interface EvaluationResult {
  total: number;
  grade: string;
  remark: string;
}

/**
 * Evaluate a student's scores against a grading scheme.
 *
 * Rules:
 * - Missing part scores are treated as 0.
 * - Scores above a part's maximum are clamped to that maximum.
 * - The total is the sum of all (clamped) part scores.
 * - The grade and remark come from the first boundary whose [min, max]
 *   range contains the total (inclusive on both ends).
 *
 * @param scheme  The grading scheme (parts + boundaries).
 * @param scores  A map of part name → raw score (may omit parts or exceed max).
 * @returns       { total, grade, remark }
 * @throws        Error if no boundary matches the total (indicates an invalid scheme).
 */
export function evaluateScheme(
  scheme: SchemeData,
  scores: Record<string, number>,
): EvaluationResult {
  // 1️⃣ Sum clamped part scores
  const total = scheme.parts.reduce((sum, part) => {
    const raw = scores[part.name] ?? 0; // missing → 0
    const clamped = Math.min(raw, part.max); // over-max → clamp
    return sum + clamped;
  }, 0);

  // 2️⃣ Find the matching boundary
  const match = scheme.boundaries.find(
    (b) => total >= b.min && total <= b.max,
  );

  if (!match) {
    throw new Error(
      `No boundary found for total ${total}. The grading scheme is invalid.`,
    );
  }

  return { total, grade: match.grade, remark: match.remark };
}
