import { evaluateScheme, type SchemeData } from "@/lib/grading/calculate";
import type { Part, Boundary } from "@/lib/validation/gradingScheme";

export const DEFAULT_FALLBACK_SCHEME: SchemeData = {
  parts: [
    { name: "CA", max: 40 },
    { name: "Exam", max: 60 },
  ],
  boundaries: [
    { grade: "A", min: 70, max: 100, remark: "Excellent" },
    { grade: "B", min: 60, max: 69, remark: "Very Good" },
    { grade: "C", min: 50, max: 59, remark: "Credit" },
    { grade: "D", min: 45, max: 49, remark: "Pass" },
    { grade: "E", min: 40, max: 44, remark: "Fair" },
    { grade: "F", min: 0, max: 39, remark: "Fail" },
  ],
};

export interface StudentInfo {
  id: string;
  admission_number: string;
  full_name: string;
  status: string;
}

export interface ScoreRowInput {
  student_id?: string;
  admission_number?: string;
  scores: Record<string, number | string | null | undefined>;
}

export interface ValidatedScoreRow {
  student_id: string;
  admission_number: string;
  full_name: string;
  scores: Record<string, number>;
  hasAnyScore: boolean;
  ca_score: number | null;
  exam_score: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
}

export interface ValidateScoresParams {
  rows: ScoreRowInput[];
  scheme: SchemeData;
  students: StudentInfo[];
  isSubmission?: boolean;
}

export interface ValidateScoresResult {
  valid: boolean;
  errors: string[];
  validatedRows: ValidatedScoreRow[];
}

export function validateScores({
  rows,
  scheme,
  students,
  isSubmission = false,
}: ValidateScoresParams): ValidateScoresResult {
  const errors: string[] = [];
  const validatedRows: ValidatedScoreRow[] = [];

  const studentByAdm = new Map<string, StudentInfo>();
  const studentById = new Map<string, StudentInfo>();

  for (const s of students) {
    studentByAdm.set(s.admission_number.trim().toUpperCase(), s);
    studentById.set(s.id, s);
  }

  const seenAdm = new Set<string>();

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 1;

    // 1. Locate student
    let student: StudentInfo | undefined;
    const admKey = row.admission_number?.trim().toUpperCase();

    if (admKey) {
      student = studentByAdm.get(admKey);
    } else if (row.student_id) {
      student = studentById.get(row.student_id);
    }

    if (!student) {
      const identifier = row.admission_number || row.student_id || `Row ${rowNum}`;
      errors.push(`Row ${rowNum}: Unknown or unassigned student "${identifier}".`);
      continue;
    }

    if (student.status !== "ACTIVE") {
      errors.push(
        `Row ${rowNum}: Student "${student.full_name}" (${student.admission_number}) is not active (${student.status}).`
      );
      continue;
    }

    // 2. Duplicate detection
    const normalizedAdm = student.admission_number.trim().toUpperCase();
    if (seenAdm.has(normalizedAdm)) {
      errors.push(
        `Row ${rowNum}: Duplicate student entry for admission number "${student.admission_number}".`
      );
      continue;
    }
    seenAdm.add(normalizedAdm);

    // 3. Score parts validation
    const parsedPartScores: Record<string, number> = {};
    let rowHasScoreError = false;
    let hasAnyScore = false;
    let hasEnteredCa = false;
    let hasEnteredExam = false;

    for (const part of scheme.parts) {
      // Allow case-insensitive matching for part name in input
      const rawVal =
        row.scores[part.name] ??
        row.scores[part.name.toLowerCase()] ??
        row.scores[part.name.toUpperCase()];

      if (rawVal === undefined || rawVal === null || rawVal === "") {
        if (isSubmission) {
          errors.push(
            `Row ${rowNum} (${student.admission_number}): Missing score for "${part.name}".`
          );
          rowHasScoreError = true;
        } else {
          // In draft mode, missing is treated as 0 for sum calculation if other parts are present
          parsedPartScores[part.name] = 0;
        }
        continue;
      }

      const numVal = typeof rawVal === "number" ? rawVal : Number(rawVal);

      if (isNaN(numVal)) {
        errors.push(
          `Row ${rowNum} (${student.admission_number}): Invalid numeric score "${rawVal}" for "${part.name}".`
        );
        rowHasScoreError = true;
        continue;
      }

      if (numVal < 0) {
        errors.push(
          `Row ${rowNum} (${student.admission_number}): Score cannot be negative for "${part.name}" (got ${numVal}).`
        );
        rowHasScoreError = true;
        continue;
      }

      if (numVal > part.max) {
        errors.push(
          `Row ${rowNum} (${student.admission_number}): Score ${numVal} in "${part.name}" exceeds the maximum of ${part.max}.`
        );
        rowHasScoreError = true;
        continue;
      }

      parsedPartScores[part.name] = numVal;
      hasAnyScore = true;
      if (part.name.toLowerCase().includes("exam")) {
        hasEnteredExam = true;
      } else {
        hasEnteredCa = true;
      }
    }

    if (rowHasScoreError) {
      continue;
    }

    // 4. Calculate total, grade, remark
    let evalRes: { total: number; grade: string; remark: string } | null = null;
    if (hasAnyScore || isSubmission) {
      try {
        evalRes = evaluateScheme(scheme, parsedPartScores);
      } catch (e: any) {
        errors.push(`Row ${rowNum} (${student.admission_number}): Calculation error: ${e.message}`);
        continue;
      }
    }

    // 5. Partition CA and Exam scores
    let caScore: number | null = null;
    let examScore: number | null = null;

    const hasExamNamedPart = scheme.parts.some((p) =>
      p.name.toLowerCase().includes("exam")
    );

    if (hasExamNamedPart) {
      let caSum = 0;
      let examSum = 0;
      for (const part of scheme.parts) {
        const val = parsedPartScores[part.name] ?? 0;
        if (part.name.toLowerCase().includes("exam")) {
          examSum += val;
        } else {
          caSum += val;
        }
      }
      caScore = hasEnteredCa || isSubmission ? caSum : null;
      examScore = hasEnteredExam || isSubmission ? examSum : null;
    } else {
      if (scheme.parts.length === 2) {
        caScore = hasEnteredCa || isSubmission ? (parsedPartScores[scheme.parts[0].name] ?? 0) : null;
        examScore = hasEnteredExam || isSubmission ? (parsedPartScores[scheme.parts[1].name] ?? 0) : null;
      } else {
        caScore = null;
        examScore = evalRes ? evalRes.total : null;
      }
    }

    validatedRows.push({
      student_id: student.id,
      admission_number: student.admission_number,
      full_name: student.full_name,
      scores: parsedPartScores,
      hasAnyScore,
      ca_score: caScore,
      exam_score: examScore,
      total: evalRes ? evalRes.total : null,
      grade: evalRes ? evalRes.grade : null,
      remark: evalRes ? evalRes.remark : null,
    });
  }

  // 6. If submission, verify all active students in class are present
  if (isSubmission && students.length > 0) {
    const presentAdmSet = new Set(validatedRows.map((r) => r.admission_number.trim().toUpperCase()));
    for (const student of students) {
      if (student.status === "ACTIVE") {
        const norm = student.admission_number.trim().toUpperCase();
        if (!presentAdmSet.has(norm)) {
          errors.push(
            `Missing score submission for student "${student.full_name}" (${student.admission_number}). All active students must have scores.`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    validatedRows: errors.length === 0 ? validatedRows : [],
  };
}
