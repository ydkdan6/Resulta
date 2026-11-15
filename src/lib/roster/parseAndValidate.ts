import Papa from "papaparse";
import ExcelJS from "exceljs";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS_LIMIT = 3000;

export interface RawRosterRow {
  rowNumber: number;
  admission_number: string;
  full_name: string;
  class_name: string;
}

export type RowAction = "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";

export interface ValidatedRosterRow {
  rowNumber: number;
  admission_number: string;
  full_name: string;
  class_name: string;
  action: RowAction;
  errors: string[];
}

export interface ExistingStudentInfo {
  admission_number: string;
  full_name: string;
  class_name: string;
}

export interface ParseOptions {
  fileName: string;
  buffer: Buffer;
  existingStudents?: ExistingStudentInfo[];
  existingClassNames?: string[];
}

export interface RosterPreviewResult {
  totalRows: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  rows: ValidatedRosterRow[];
  unknownClasses: string[];
  warnings: string[];
  hasMixedAdmissionLengths: boolean;
}

/**
 * Normalizes human names: trims excess whitespace and normalizes capital letters.
 * e.g. "  john   dOE  " -> "John Doe", "CHUKWUEMEKA OBI" -> "Chukwuemeka Obi"
 */
export function normalizeFullName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return trimmed
    .split(" ")
    .map((part) => {
      if (!part) return "";
      // Keep hyphenated parts capitalized correctly e.g. Mary-Ann
      return part
        .split("-")
        .map((sub) => sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase())
        .join("-");
    })
    .join(" ");
}

/**
 * Parses buffer based on file extension and returns raw string rows.
 * Reads admission_number strictly as string preserving leading zeros.
 */
export async function parseFileToRawRows(
  fileName: string,
  buffer: Buffer,
): Promise<{ rows: RawRosterRow[]; warnings: string[] }> {
  const lowerName = fileName.toLowerCase();
  const warnings: string[] = [];

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size exceeds 5 MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`);
  }

  if (lowerName.endsWith(".csv")) {
    const text = buffer.toString("utf-8");
    const parsed = Papa.parse<Record<string, any>>(text, {
      header: true,
      skipEmptyLines: "greedy",
      dynamicTyping: false, // DO NOT parse numbers; preserve leading zeros as strings
    });

    if (parsed.errors && parsed.errors.length > 0) {
      for (const err of parsed.errors.slice(0, 5)) {
        warnings.push(`CSV parsing warning at row ${err.row ?? "unknown"}: ${err.message}`);
      }
    }

    const rows: RawRosterRow[] = [];
    for (let i = 0; i < parsed.data.length; i++) {
      const item = parsed.data[i];
      // Find matching keys case-insensitively
      const admissionKey = Object.keys(item).find(
        (k) => k.trim().toLowerCase().replace(/[\s_-]+/g, "") === "admissionnumber",
      );
      const nameKey = Object.keys(item).find(
        (k) =>
          k.trim().toLowerCase().replace(/[\s_-]+/g, "") === "fullname" ||
          k.trim().toLowerCase() === "name" ||
          k.trim().toLowerCase() === "studentname",
      );
      const classKey = Object.keys(item).find(
        (k) =>
          k.trim().toLowerCase().replace(/[\s_-]+/g, "") === "class" ||
          k.trim().toLowerCase().replace(/[\s_-]+/g, "") === "classname",
      );

      const admission_number = admissionKey ? String(item[admissionKey] ?? "").trim() : "";
      const full_name = nameKey ? String(item[nameKey] ?? "").trim() : "";
      const class_name = classKey ? String(item[classKey] ?? "").trim() : "";

      // Skip completely empty rows
      if (!admission_number && !full_name && !class_name) continue;

      rows.push({
        rowNumber: i + 2, // 1-indexed row accounting for header
        admission_number,
        full_name,
        class_name,
      });
    }

    return { rows, warnings };
  } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS load buffer
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error("Excel file contains no worksheets.");
    }

    const rows: RawRosterRow[] = [];
    let headerRowIndex = 1;
    let admissionCol = -1;
    let nameCol = -1;
    let classCol = -1;

    // Detect header columns
    worksheet.eachRow((row, rowNumber) => {
      if (admissionCol !== -1 && nameCol !== -1 && classCol !== -1) return;
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
        if (val === "admissionnumber" || val === "admno") admissionCol = colNumber;
        if (val === "fullname" || val === "name" || val === "studentname") nameCol = colNumber;
        if (val === "class" || val === "classname") classCol = colNumber;
      });
      if (admissionCol !== -1 || nameCol !== -1 || classCol !== -1) {
        headerRowIndex = rowNumber;
      }
    });

    if (admissionCol === -1 && nameCol === -1 && classCol === -1) {
      // Default fallback to columns 1, 2, 3
      admissionCol = 1;
      nameCol = 2;
      classCol = 3;
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowIndex) return;

      const getCellString = (col: number) => {
        if (col === -1) return "";
        const cell = row.getCell(col);
        if (cell.value === null || cell.value === undefined) return "";
        // If it's a formula result, cell.result holds it; otherwise cell.text or cell.value
        if (typeof cell.value === "object" && "result" in cell.value) {
          return String((cell.value as any).result ?? "").trim();
        }
        // cell.text preserves formatting, cell.value gets raw
        return String(cell.text || cell.value || "").trim();
      };

      const admission_number = getCellString(admissionCol);
      const full_name = getCellString(nameCol);
      const class_name = getCellString(classCol);

      if (!admission_number && !full_name && !class_name) return;

      rows.push({
        rowNumber,
        admission_number,
        full_name,
        class_name,
      });
    });

    return { rows, warnings };
  } else {
    throw new Error("Unsupported file type. Only CSV and Excel (.xlsx) files are accepted.");
  }
}

/**
 * Validates parsed raw rows against business rules:
 * - 3000 rows limit
 * - Missing fields
 * - In-file duplicates
 * - Checks against existing students (NEW, UPDATE, UNCHANGED)
 * - Identifies unknown classes
 * - Warns on mixed admission number lengths
 */
export function validateRosterRows(
  rawRows: RawRosterRow[],
  existingStudents: ExistingStudentInfo[] = [],
  existingClassNames: string[] = [],
): RosterPreviewResult {
  if (rawRows.length > MAX_ROWS_LIMIT) {
    throw new Error(`File contains ${rawRows.length} rows, which exceeds the maximum limit of ${MAX_ROWS_LIMIT} rows.`);
  }

  const existingMap = new Map<string, ExistingStudentInfo>();
  for (const s of existingStudents) {
    existingMap.set(s.admission_number.trim().toLowerCase(), {
      ...s,
      admission_number: s.admission_number.trim(),
      full_name: normalizeFullName(s.full_name),
      class_name: s.class_name.trim(),
    });
  }

  const normalizedClassSet = new Set(existingClassNames.map((c) => c.trim().toLowerCase()));
  const seenInFile = new Map<string, number>(); // admission_number (lower) -> first rowNumber
  const unknownClassSet = new Set<string>();

  const admissionLengths = new Set<number>();
  const validatedRows: ValidatedRosterRow[] = [];

  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let errorCount = 0;

  for (const raw of rawRows) {
    const rowErrors: string[] = [];
    const adm = raw.admission_number.trim();
    const admKey = adm.toLowerCase();
    const normalizedName = normalizeFullName(raw.full_name);
    const cls = raw.class_name.trim();

    // 1. Missing fields validation
    if (!adm) {
      rowErrors.push("Admission number is required");
    } else {
      admissionLengths.add(adm.length);
      // In-file duplicate check
      if (seenInFile.has(admKey)) {
        rowErrors.push(`Duplicate admission number in file (already on row ${seenInFile.get(admKey)})`);
      } else {
        seenInFile.set(admKey, raw.rowNumber);
      }
    }

    if (!raw.full_name.trim()) {
      rowErrors.push("Full name is required");
    }

    if (!cls) {
      rowErrors.push("Class is required");
    } else {
      if (!normalizedClassSet.has(cls.toLowerCase())) {
        unknownClassSet.add(cls);
      }
    }

    // Determine action & counts
    let action: RowAction = "NEW";
    if (rowErrors.length > 0) {
      action = "ERROR";
      errorCount++;
    } else {
      const existing = existingMap.get(admKey);
      if (!existing) {
        action = "NEW";
        newCount++;
      } else {
        const isNameSame = existing.full_name.toLowerCase() === normalizedName.toLowerCase();
        const isClassSame = existing.class_name.toLowerCase() === cls.toLowerCase();
        if (isNameSame && isClassSame) {
          action = "UNCHANGED";
          unchangedCount++;
        } else {
          action = "UPDATE";
          updatedCount++;
        }
      }
    }

    validatedRows.push({
      rowNumber: raw.rowNumber,
      admission_number: adm,
      full_name: normalizedName,
      class_name: cls,
      action,
      errors: rowErrors,
    });
  }

  const warnings: string[] = [];
  const hasMixedAdmissionLengths = admissionLengths.size > 1;
  if (hasMixedAdmissionLengths) {
    warnings.push(
      `Admission numbers have mixed lengths (${Array.from(admissionLengths).sort((a, b) => a - b).join(", ")} characters). Please verify that leading zeros were not dropped.`,
    );
  }

  return {
    totalRows: rawRows.length,
    newCount,
    updatedCount,
    unchangedCount,
    errorCount,
    rows: validatedRows,
    unknownClasses: Array.from(unknownClassSet),
    warnings,
    hasMixedAdmissionLengths,
  };
}

/**
 * Generates CSV string for downloadable error report.
 */
export function generateErrorReportCsv(rowsWithErrors: ValidatedRosterRow[]): string {
  const data = rowsWithErrors
    .filter((r) => r.errors.length > 0)
    .map((r) => ({
      Row: r.rowNumber,
      Admission_Number: r.admission_number,
      Full_Name: r.full_name,
      Class: r.class_name,
      Errors: r.errors.join("; "),
    }));

  return Papa.unparse(data);
}

/**
 * Generates sample CSV template content.
 */
export function getSampleRosterTemplateCsv(): string {
  return [
    "# Resulta Student Roster Import Template",
    "# Note: The admission_number column MUST be formatted as text to preserve leading zeros (e.g. 0042, 2026/0012).",
    "admission_number,full_name,class",
    "2026/0001,Abdullahi Musa Ibrahim,JSS 1A",
    "2026/0002,Chioma Grace Adebayo,JSS 1A",
    "0042,Emeka David Okafor,JSS 1B",
    "0043,Fatima Zahra Usman,JSS 1B",
  ].join("\r\n");
}
