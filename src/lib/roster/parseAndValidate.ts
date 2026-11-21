// src/lib/roster/parseAndValidate.ts
import Papa from "papaparse";
import ExcelJS from "exceljs";

// ---------- Constants ----------
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_ROWS_LIMIT = 3000;
export const MAX_ADMISSION_NUMBER_LENGTH = 50;
export const MAX_FULL_NAME_LENGTH = 120;
export const MAX_CLASS_NAME_LENGTH = 50;
export const MAX_DEPARTMENT_NAME_LENGTH = 50;

// ---------- Department Normalization & Detection ----------
export type DepartmentSource = "COLUMN" | "CLASS_VALUE" | "NONE";

/**
 * Normalises human names: trims excess whitespace and normalizes capital letters.
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
 * Normalises department names: trims spaces, maps common short forms.
 * Sci -> Science, Art -> Arts, Comm / Business -> Commercial.
 */
export function normalizeDepartmentName(dept: string | null | undefined): string | null {
  if (!dept) return null;
  const trimmed = dept.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (lower === "sci" || lower === "science" || lower === "sciences") {
    return "Science";
  }
  if (lower === "art" || lower === "arts" || lower === "humanities") {
    return "Arts";
  }
  if (lower === "comm" || lower === "commercial" || lower === "business" || lower === "biz") {
    return "Commercial";
  }

  // Capitalize each word
  return trimmed
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Detects department and class value from raw row inputs.
 * Order of detection:
 * 1. Dedicated column: department, dept, section, stream
 * 2. Embedded in class value, e.g. "SS2 Science" -> class: "SS2", department: "Science"
 * 3. None
 */
export function detectDepartmentAndClass(
  rawClass: string,
  rawDept?: string | null
): {
  className: string;
  departmentName: string | null;
  departmentSource: DepartmentSource;
} {
  // 1. Column detection
  if (rawDept && rawDept.trim()) {
    return {
      className: rawClass.trim(),
      departmentName: normalizeDepartmentName(rawDept),
      departmentSource: "COLUMN",
    };
  }

  // 2. Class value detection, e.g. "SS 2 Science", "SS2 Science", "SS3 Commercial", "SS1 Arts", "SS2 Sci"
  const classTrimmed = rawClass.trim();
  const pattern = /^(SS\s*[1-3]|SSS\s*[1-3]|Senior\s*Secondary\s*[1-3])\s+(Science|Sciences|Sci|Arts|Art|Commercial|Comm|Business|Biz)(.*)$/i;
  const match = classTrimmed.match(pattern);

  if (match) {
    const classBase = match[1].replace(/\s+/g, " ").trim();
    const deptPart = match[2].trim();
    const suffix = match[3]?.trim();
    const fullClass = suffix ? `${classBase} ${suffix}` : classBase;
    return {
      className: fullClass,
      departmentName: normalizeDepartmentName(deptPart),
      departmentSource: "CLASS_VALUE",
    };
  }

  // 3. None
  return {
    className: classTrimmed,
    departmentName: null,
    departmentSource: "NONE",
  };
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
 * Includes optional department column.
 */
export function getSampleRosterTemplateCsv(): string {
  const headers = ["admission_number", "full_name", "class_name", "department"];
  const headerLine = headers.map(escapeCsvCell).join(",");
  const exampleLine = ["", "", "", ""].map(escapeCsvCell).join(",");
  return `${headerLine}\n${exampleLine}\n`;
}

/**
 * Generates an error report CSV from roster validation results.
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
 * Validate a single student row for school-admin API.
 */
export function validateStudentRow(
  row: { admissionNumber: string; fullName: string; classId: string; departmentId?: string | null },
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
  department_name?: string | null;
  department_source?: DepartmentSource;
}

export type RowAction = "NEW" | "UPDATE" | "UNCHANGED" | "ERROR";

export interface DepartmentChangeInfo {
  oldDepartment: string | null;
  newDepartment: string | null;
  affectedSubjects?: string[];
}

export interface ValidatedRosterRow {
  rowNumber: number;
  admission_number: string;
  full_name: string;
  class_name: string;
  department_name: string | null;
  department_source: DepartmentSource;
  action: RowAction;
  departmentChange?: DepartmentChangeInfo;
  errors: string[];
}

export interface ExistingStudentInfo {
  admission_number: string;
  full_name: string;
  class_name: string;
  department_name?: string | null;
  department_id?: string | null;
  submittedSubjects?: string[];
}

export interface ParseOptions {
  fileName: string;
  buffer: Buffer;
  existingStudents?: ExistingStudentInfo[];
  existingClassNames?: string[];
  existingDepartmentNames?: string[];
}

export interface RosterPreviewResult {
  totalRows: number;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  errorCount: number;
  rows: ValidatedRosterRow[];
  unknownClasses: string[];
  unknownDepartments: string[];
  departmentChanges: {
    admission_number: string;
    full_name: string;
    from: string;
    to: string;
    affectedSubjects: string[];
  }[];
  requiresDepartmentConfirmation: boolean;
  warnings: string[];
  hasMixedAdmissionLengths: boolean;
}

/**
 * Parses a file (CSV or XLSX) into raw rows with department detection.
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
      const admissionKey = Object.keys(item).find((k) => {
        const low = k.trim().toLowerCase().replace(/[\s_-]+/g, '');
        return low === 'admissionnumber' || low === 'admno';
      });
      const nameKey = Object.keys(item).find((k) => {
        const low = k.trim().toLowerCase().replace(/[\s_-]+/g, '');
        return low === 'fullname' || low === 'name' || low === 'studentname';
      });
      const classKey = Object.keys(item).find((k) => {
        const low = k.trim().toLowerCase().replace(/[\s_-]+/g, '');
        return low === 'class' || low === 'classname';
      });
      const deptKey = Object.keys(item).find((k) => {
        const low = k.trim().toLowerCase().replace(/[\s_-]+/g, '');
        return low === 'department' || low === 'dept' || low === 'section' || low === 'stream';
      });

      const admission_number = (item[admissionKey || 'admission_number'] ?? '').toString().trim();
      const full_name = (item[nameKey || 'full_name'] ?? '').toString().trim();
      const rawClass = (item[classKey || 'class_name'] ?? item['class'] ?? '').toString().trim();
      const rawDept = deptKey ? (item[deptKey] ?? '').toString().trim() : '';

      if (!admission_number && !full_name && !rawClass && !rawDept) continue;

      const detected = detectDepartmentAndClass(rawClass, rawDept);

      rows.push({
        rowNumber: i + 2,
        admission_number,
        full_name,
        class_name: detected.className,
        department_name: detected.departmentName,
        department_source: detected.departmentSource,
      });
    }
    return { rows, warnings };
  }

  if (lower.endsWith('.xlsx')) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Workbook contains no sheets.');
    }
    const rows: RawRosterRow[] = [];
    let admissionCol = -1, nameCol = -1, classCol = -1, deptCol = -1;
    let headerRow = 1;

    worksheet.eachRow((row, rowNumber) => {
      if (admissionCol !== -1 || nameCol !== -1 || classCol !== -1) return;
      row.eachCell((cell, colNumber) => {
        const val = String(cell.value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
        if (val === 'admissionnumber' || val === 'admno') admissionCol = colNumber;
        if (val === 'fullname' || val === 'name' || val === 'studentname') nameCol = colNumber;
        if (val === 'class' || val === 'classname') classCol = colNumber;
        if (val === 'department' || val === 'dept' || val === 'section' || val === 'stream') deptCol = colNumber;
      });
      if (admissionCol !== -1 || nameCol !== -1 || classCol !== -1) {
        headerRow = rowNumber;
      }
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
      const rawClass = getString(classCol);
      const rawDept = deptCol !== -1 ? getString(deptCol) : '';

      if (!admission_number && !full_name && !rawClass && !rawDept) return;

      const detected = detectDepartmentAndClass(rawClass, rawDept);

      rows.push({
        rowNumber,
        admission_number,
        full_name,
        class_name: detected.className,
        department_name: detected.departmentName,
        department_source: detected.departmentSource,
      });
    });
    return { rows, warnings };
  }

  throw new Error('Unsupported file type. Only CSV and Excel (.xlsx) files are accepted.');
}

/**
 * Validates raw rows against business rules including departments.
 */
export function validateRosterRows(
  rawRows: RawRosterRow[],
  existingStudents: ExistingStudentInfo[] = [],
  existingClassNames: string[] = [],
  existingDepartmentNames: string[] = [],
  departmentSubjectsMap: Map<string, Set<string>> = new Map(), // deptName -> Set of subject names offered
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
      department_name: s.department_name ? normalizeDepartmentName(s.department_name) : null,
    });
  }

  const classSet = new Set(existingClassNames.map((c) => c.trim().toLowerCase()));
  const deptSet = new Set(existingDepartmentNames.map((d) => d.trim().toLowerCase()));

  const seen = new Map<string, number>();
  const unknownClassSet = new Set<string>();
  const unknownDeptSet = new Set<string>();
  const admissionLengths = new Set<number>();
  const warnings: string[] = [];
  const departmentChanges: {
    admission_number: string;
    full_name: string;
    from: string;
    to: string;
    affectedSubjects: string[];
  }[] = [];

  const validated: ValidatedRosterRow[] = [];
  let newCount = 0, updatedCount = 0, unchangedCount = 0, errorCount = 0;

  for (const raw of rawRows) {
    const key = raw.admission_number.trim().toLowerCase();
    admissionLengths.add(raw.admission_number.length);

    // Re-run department detection on server to never trust browser
    const detected = detectDepartmentAndClass(raw.class_name, raw.department_name);
    const effectiveClass = detected.className;
    const effectiveDept = detected.departmentName;
    const effectiveDeptSource = detected.departmentSource;

    if (seen.has(key)) {
      validated.push({
        ...raw,
        class_name: effectiveClass,
        department_name: effectiveDept,
        department_source: effectiveDeptSource,
        action: "ERROR",
        errors: ["Duplicate admission number in file"],
      });
      errorCount++;
      continue;
    }
    seen.set(key, raw.rowNumber);

    const errors: string[] = [];
    if (!raw.admission_number) errors.push('Admission number is required');
    if (!raw.full_name) errors.push('Full name is required');
    if (!effectiveClass) errors.push('Class is required');
    if (raw.admission_number.length > MAX_ADMISSION_NUMBER_LENGTH)
      errors.push(`Admission number exceeds maximum length of ${MAX_ADMISSION_NUMBER_LENGTH}`);
    if (raw.full_name.length > MAX_FULL_NAME_LENGTH)
      errors.push(`Full name exceeds maximum length of ${MAX_FULL_NAME_LENGTH}`);
    if (effectiveClass.length > MAX_CLASS_NAME_LENGTH)
      errors.push(`Class name exceeds maximum length of ${MAX_CLASS_NAME_LENGTH}`);
    if (effectiveDept && effectiveDept.length > MAX_DEPARTMENT_NAME_LENGTH)
      errors.push(`Department name exceeds maximum length of ${MAX_DEPARTMENT_NAME_LENGTH}`);

    // Unknown department check
    if (effectiveDept && !deptSet.has(effectiveDept.toLowerCase())) {
      unknownDeptSet.add(effectiveDept);
      errors.push(`Unknown department: "${effectiveDept}".`);
    }

    // SS2 and SS3 students with no department get a warning, not an error! JSS and primary need none.
    const isSS2orSS3 = /^(SS\s*[23]|SSS\s*[23]|Senior\s*Secondary\s*[23])/i.test(effectiveClass);
    if (isSS2orSS3 && !effectiveDept) {
      warnings.push(`Row ${raw.rowNumber} (${raw.admission_number}): Student in ${effectiveClass} has no department assigned.`);
    }

    if (errors.length > 0) {
      validated.push({
        ...raw,
        class_name: effectiveClass,
        department_name: effectiveDept,
        department_source: effectiveDeptSource,
        action: "ERROR",
        errors,
      });
      errorCount++;
      continue;
    }

    // Check unknown classes
    if (!classSet.has(effectiveClass.toLowerCase())) {
      unknownClassSet.add(effectiveClass);
    }

    const existing = existingMap.get(key);
    if (existing) {
      const nameChanged = normalizeFullName(existing.full_name) !== normalizeFullName(raw.full_name);
      const classChanged = existing.class_name.toLowerCase() !== effectiveClass.toLowerCase();
      const deptChanged = (existing.department_name || null) !== (effectiveDept || null);

      let deptChangeInfo: DepartmentChangeInfo | undefined;

      if (deptChanged) {
        // Calculate affected subjects (subjects existing student has that new department does NOT offer)
        const oldDept = existing.department_name || "None";
        const newDept = effectiveDept || "None";

        let affectedSubjects: string[] = [];
        if (effectiveDept && existing.submittedSubjects && existing.submittedSubjects.length > 0) {
          const newDeptOffered = departmentSubjectsMap.get(effectiveDept.toLowerCase()) || new Set();
          affectedSubjects = existing.submittedSubjects.filter((subj) => !newDeptOffered.has(subj.toLowerCase()));
        }

        deptChangeInfo = {
          oldDepartment: existing.department_name || null,
          newDepartment: effectiveDept || null,
          affectedSubjects,
        };

        departmentChanges.push({
          admission_number: raw.admission_number,
          full_name: raw.full_name,
          from: oldDept,
          to: newDept,
          affectedSubjects,
        });
      }

      if (nameChanged || classChanged || deptChanged) {
        validated.push({
          ...raw,
          class_name: effectiveClass,
          department_name: effectiveDept,
          department_source: effectiveDeptSource,
          action: "UPDATE",
          departmentChange: deptChangeInfo,
          errors,
        });
        updatedCount++;
      } else {
        validated.push({
          ...raw,
          class_name: effectiveClass,
          department_name: effectiveDept,
          department_source: effectiveDeptSource,
          action: "UNCHANGED",
          errors,
        });
        unchangedCount++;
      }
    } else {
      validated.push({
        ...raw,
        class_name: effectiveClass,
        department_name: effectiveDept,
        department_source: effectiveDeptSource,
        action: "NEW",
        errors,
      });
      newCount++;
    }
  }

  if (unknownClassSet.size) warnings.push(`Unknown classes: ${Array.from(unknownClassSet).join(', ')}`);
  const hasMixedAdmissionLengths = admissionLengths.size > 1;
  if (hasMixedAdmissionLengths) {
    warnings.push('Warning: admission numbers have mixed lengths. Ensure the column is formatted as text in Excel to prevent leading zeros from being dropped.');
  }

  return {
    totalRows: rawRows.length,
    newCount,
    updatedCount,
    unchangedCount,
    errorCount,
    rows: validated,
    unknownClasses: Array.from(unknownClassSet),
    unknownDepartments: Array.from(unknownDeptSet),
    departmentChanges,
    requiresDepartmentConfirmation: departmentChanges.length > 0,
    warnings,
    hasMixedAdmissionLengths,
  };
}
