// src/lib/roster/parseAndValidate.ts
import Papa from "papaparse";
import ExcelJS from "exceljs";

// ---------- Constants ----------
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS_LIMIT = 3000;
export const MAX_ADMISSION_NUMBER_LENGTH = 50;
export const MAX_FULL_NAME_LENGTH = 120;
export const MAX_CLASS_NAME_LENGTH = 50;

// ---------- Helpers ----------
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
      return part
        .split("-")
        .map((sub) => sub.charAt(0).toUpperCase() + sub.slice(1).toLowerCase())
        .join("-");
    })
    .join(" ");
}

/**
 * Escapes CSV cell to prevent formula injection in Excel/Calc.
 * Cells starting with =, +, -, @ get a leading apostrophe.
 */
export function escapeCsvCell(val: string): string {
  if (!val) return "";
  const first = val.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@") {
    return `'${val}`;
  }
  return val;
}

/**
 * Generates a CSV template for roster uploads.
 * No comment line, and every cell is escaped via `escapeCsvCell`.
 */
export function getSampleRosterTemplateCsv(): string {
  const headers = ["admission_number", "full_name", "class_name"];
  const headerLine = headers.map(escapeCsvCell).join(",");
  const exampleLine = ["", "", ""].map(escapeCsvCell).join(",");
  return `${headerLine}\n${exampleLine}\n`;
}

/**
 * Generates an error report CSV from roster validation results.
 * All cells are escaped via `escapeCsvCell`.
 */
export function generateErrorReportCsv(rows: ValidatedRosterRow[]): string {
  const header = ["Row", "Admission_Number", "Full_Name", "Class", "Errors"]
    .map(escapeCsvCell)
    .join(",");
  const errorRows = rows.filter((r) => r.errors.length > 0);
  const lines = errorRows.map((r) => {
    const err = r.errors.join("; ");
    return [
      String(r.rowNumber),
      r.admission_number,
      r.full_name,
      r.class_name,
      err,
    ]
      .map(escapeCsvCell)
      .join(",");
  });
  return [header, ...lines].join("\n") + "\n";
}
/**
 * Validate a single student row for school‑admin API.
 */
export function validateStudentRow(
  row: { admissionNumber: string; fullName: string; classId: string },
  schoolId: string,
) {
  const { admissionNumber, fullName, classId } = row;
  if (!admissionNumber) return { valid: false, error: "Admission number is required" };
  if (admissionNumber.length > MAX_ADMISSION_NUMBER_LENGTH)
    return { valid: false, error: `Admission number exceeds maximum length of ${MAX_ADMISSION_NUMBER_LENGTH}` };
  if (!fullName) return { valid: false, error: "Full name is required" };
  if (fullName.length > MAX_FULL_NAME_LENGTH)
    return { valid: false, error: `Full name exceeds maximum length of ${MAX_FULL_NAME_LENGTH}` };
  if (!classId) return { valid: false, error: "Class ID is required" };
  if (classId.length > MAX_CLASS_NAME_LENGTH)
    return { valid: false, error: `Class ID exceeds maximum length of ${MAX_CLASS_NAME_LENGTH}` };
  return { valid: true };
}

// ---------- Types ----------
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
 * Parses a file (CSV or XLSX) into raw rows.
 */
export async function parseFileToRawRows(
  fileName: string,
  buffer: Buffer,
): Promise<{ rows: RawRosterRow[]; warnings: string[] }> {
  const lower = fileName.toLowerCase();
  const warnings: string[] = [];

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size exceeds 5 MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`);
  }

  if (lower.endsWith('.csv')) {
    const text = buffer.toString('utf-8');
    const parsed = Papa.parse<Record<string, any>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
    });
    if (parsed.errors && parsed.errors.length) {
      for (const err of parsed.errors.slice(0, 5)) {
        warnings.push(`CSV parsing warning at row ${err.row ?? 'unknown'}: ${err.message}`);
      }
    }
    const rows: RawRosterRow[] = [];
    for (let i = 0; i < parsed.data.length; i++) {
      const item = parsed.data[i];
      const admissionKey = Object.keys(item).find((k) => k.trim().toLowerCase().replace(/[\s_-]+/g, '') === 'admissionnumber');
      const nameKey = Object.keys(item).find((k) => {
        const low = k.trim().toLowerCase().replace(/[\s_-]+/g, '');
        return low === 'fullname' || low === 'name' || low === 'studentname';
      });
      const classKey = Object.keys(item).find((k) => {
        const low = k.trim().toLowerCase().replace(/[\s_-]+/g, '');
        return low === 'class' || low === 'classname';
      });
      const admission_number = admissionKey ? String(item[admissionKey] ?? '').trim() : '';
      const full_name = nameKey ? String(item[nameKey] ?? '').trim() : '';
      const class_name = classKey ? String(item[classKey] ?? '').trim() : '';
      if (!admission_number && !full_name && !class_name) continue;
      rows.push({ rowNumber: i + 2, admission_number, full_name, class_name });
    }
    return { rows, warnings };
  }

  // XLSX handling
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('Excel file contains no worksheets.');

    const rows: RawRosterRow[] = [];
    let headerRow = 1;
    let admissionCol = -1, nameCol = -1, classCol = -1;

    worksheet.eachRow((row, rowNumber) => {
      if (admissionCol !== -1 && nameCol !== -1 && classCol !== -1) return;
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
        if (val === 'admissionnumber' || val === 'admno') admissionCol = colNumber;
        if (val === 'fullname' || val === 'name' || val === 'studentname') nameCol = colNumber;
        if (val === 'class' || val === 'classname') classCol = colNumber;
      });
      if (admissionCol !== -1 || nameCol !== -1 || classCol !== -1) headerRow = rowNumber;
    });

    if (admissionCol === -1 && nameCol === -1 && classCol === -1) {
      admissionCol = 1; nameCol = 2; classCol = 3;
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      const getString = (col: number) => {
        if (col === -1) return '';
        const cell = row.getCell(col);
        if (cell.value == null) return '';
        if (typeof cell.value === 'object' && 'result' in cell.value) {
          return String((cell.value as any).result ?? '').trim();
        }
        return String(cell.text || cell.value || '').trim();
      };
      const admission_number = getString(admissionCol);
      const full_name = getString(nameCol);
      const class_name = getString(classCol);
      if (!admission_number && !full_name && !class_name) return;
      rows.push({ rowNumber, admission_number, full_name, class_name });
    });
    return { rows, warnings };
  }

  throw new Error('Unsupported file type. Only CSV and Excel (.xlsx) files are accepted.');
}

/**
 * Validates raw rows against business rules.
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

  const classSet = new Set(existingClassNames.map((c) => c.trim().toLowerCase()));
  const seen = new Map<string, number>();
  const unknownSet = new Set<string>();
  const admissionLengths = new Set<number>();

  const validated: ValidatedRosterRow[] = [];
  let newCount = 0, updatedCount = 0, unchangedCount = 0, errorCount = 0;

  for (const raw of rawRows) {
    const key = raw.admission_number.trim().toLowerCase();
    admissionLengths.add(raw.admission_number.length);

    if (seen.has(key)) {
      validated.push({ ...raw, action: "ERROR", errors: ["Duplicate admission number in file"] });
      errorCount++;
      continue;
    }
    seen.set(key, raw.rowNumber);

    const errors: string[] = [];
    if (!raw.admission_number) errors.push('Admission number is required');
    if (!raw.full_name) errors.push('Full name is required');
    if (!raw.class_name) errors.push('Class is required');
    if (raw.admission_number.length > MAX_ADMISSION_NUMBER_LENGTH) errors.push(`Admission number exceeds maximum length of ${MAX_ADMISSION_NUMBER_LENGTH}`);
    if (raw.full_name.length > MAX_FULL_NAME_LENGTH) errors.push(`Full name exceeds maximum length of ${MAX_FULL_NAME_LENGTH}`);
    if (raw.class_name.length > MAX_CLASS_NAME_LENGTH) errors.push(`Class name exceeds maximum length of ${MAX_CLASS_NAME_LENGTH}`);

    // Any row with field-level errors is an ERROR row
    if (errors.length > 0) {
      validated.push({ ...raw, action: "ERROR", errors });
      errorCount++;
      continue;
    }

    const existing = existingMap.get(key);
    if (existing) {
      if (normalizeFullName(existing.full_name) !== normalizeFullName(raw.full_name) || existing.class_name !== raw.class_name) {
        validated.push({ ...raw, action: "UPDATE", errors });
        updatedCount++;
      } else {
        validated.push({ ...raw, action: "UNCHANGED", errors });
        unchangedCount++;
      }
    } else {
      if (!classSet.has(raw.class_name.trim().toLowerCase())) unknownSet.add(raw.class_name);
      validated.push({ ...raw, action: "NEW", errors });
      newCount++;
    }
  }

  const warnings: string[] = [];
  if (unknownSet.size) warnings.push(`Unknown classes: ${Array.from(unknownSet).join(', ')}`);
  const hasMixedAdmissionLengths = admissionLengths.size > 1;
  if (hasMixedAdmissionLengths) warnings.push('Warning: admission numbers have mixed lengths. Ensure the column is formatted as text in Excel to prevent leading zeros from being dropped.');

  return {
    totalRows: rawRows.length,
    newCount,
    updatedCount,
    unchangedCount,
    errorCount,
    rows: validated,
    unknownClasses: Array.from(unknownSet),
    warnings,
    hasMixedAdmissionLengths,
  };
}
