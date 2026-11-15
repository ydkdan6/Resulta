import { test, describe } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  parseFileToRawRows,
  validateRosterRows,
  normalizeFullName,
  generateErrorReportCsv,
  MAX_FILE_SIZE_BYTES,
  MAX_ROWS_LIMIT,
} from "../../src/lib/roster/parseAndValidate.ts";

describe("Roster Parser & Validation Tests", () => {
  // 1. Name normalization
  test("normalizeFullName trims spaces and capitalizes names properly", () => {
    assert.strictEqual(normalizeFullName("  john   doe  "), "John Doe");
    assert.strictEqual(normalizeFullName("CHUKWUEMEKA OBI"), "Chukwuemeka Obi");
    assert.strictEqual(normalizeFullName("mary-ann o'connor"), "Mary-Ann O'connor");
  });

  // 2. CSV parsing with leading zero preservation & format preservation
  test("CSV parsing preserves leading zeros and slash formats in admission_number", async () => {
    const csvContent = [
      "admission_number,full_name,class",
      "0012,John Doe,JSS 1A",
      "2026/0045,Chioma Adebayo,JSS 1A",
      "00001,Emeka Obi,JSS 1B",
    ].join("\n");

    const buffer = Buffer.from(csvContent, "utf-8");
    const { rows } = await parseFileToRawRows("students.csv", buffer);

    assert.strictEqual(rows.length, 3);
    assert.strictEqual(rows[0].admission_number, "0012");
    assert.strictEqual(rows[1].admission_number, "2026/0045");
    assert.strictEqual(rows[2].admission_number, "00001");
  });

  // 3. Excel (.xlsx) parsing with leading zero preservation
  test("Excel (.xlsx) parsing preserves text-formatted leading zeros", async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Students");
    worksheet.addRow(["admission_number", "full_name", "class"]);
    worksheet.addRow(["0042", "Amina Bello", "SS 1"]);
    worksheet.addRow(["2026/0099", "Tunde Bakare", "SS 1"]);

    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
    const { rows } = await parseFileToRawRows("students.xlsx", Buffer.from(buffer));

    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].admission_number, "0042");
    assert.strictEqual(rows[0].full_name, "Amina Bello");
    assert.strictEqual(rows[1].admission_number, "2026/0099");
  });

  // 4. File size and row limits
  test("Rejects files over 5 MB limit", async () => {
    const fakeLargeBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 100);
    await assert.rejects(
      async () => parseFileToRawRows("large.csv", fakeLargeBuffer),
      /File size exceeds 5 MB limit/,
    );
  });

  test("Rejects roster exceeding 3000 rows limit", () => {
    const excessRows = Array.from({ length: 3001 }, (_, i) => ({
      rowNumber: i + 1,
      admission_number: `ADM-${i}`,
      full_name: `Student ${i}`,
      class_name: "JSS 1",
    }));

    assert.throws(
      () => validateRosterRows(excessRows),
      /exceeds the maximum limit of 3000 rows/,
    );
  });

  // 5. Validation rules: missing fields and in-file duplicates
  test("Detects missing fields and duplicate admission numbers within the file", () => {
    const rawRows = [
      { rowNumber: 2, admission_number: "001", full_name: "Alice Smith", class_name: "JSS 1" },
      { rowNumber: 3, admission_number: "", full_name: "Bob Jones", class_name: "JSS 1" }, // missing admission
      { rowNumber: 4, admission_number: "002", full_name: "", class_name: "JSS 1" }, // missing name
      { rowNumber: 5, admission_number: "003", full_name: "Charlie Brown", class_name: "" }, // missing class
      { rowNumber: 6, admission_number: "001", full_name: "Duplicate Alice", class_name: "JSS 1" }, // in-file duplicate
    ];

    const result = validateRosterRows(rawRows, [], ["JSS 1"]);

    assert.strictEqual(result.totalRows, 5);
    assert.strictEqual(result.errorCount, 4);
    assert.strictEqual(result.newCount, 1);

    // Row 3 error
    assert.ok(result.rows[1].errors.includes("Admission number is required"));
    // Row 4 error
    assert.ok(result.rows[2].errors.includes("Full name is required"));
    // Row 5 error
    assert.ok(result.rows[3].errors.includes("Class is required"));
    // Row 6 duplicate error
    assert.ok(result.rows[4].errors.some((e) => e.includes("Duplicate admission number in file")));
  });

  // 6. Preview counts: NEW, UPDATE, UNCHANGED
  test("Accurately categorizes rows into NEW, UPDATE, and UNCHANGED", () => {
    const existing = [
      { admission_number: "ADM-1", full_name: "Musa Danladi", class_name: "JSS 1" },
      { admission_number: "ADM-2", full_name: "Ngozi Eze", class_name: "JSS 1" },
    ];

    const incoming = [
      // Unchanged
      { rowNumber: 2, admission_number: "ADM-1", full_name: "Musa Danladi", class_name: "JSS 1" },
      // Update (promoted to JSS 2)
      { rowNumber: 3, admission_number: "ADM-2", full_name: "Ngozi Eze", class_name: "JSS 2" },
      // New
      { rowNumber: 4, admission_number: "ADM-3", full_name: "Segun Adeleke", class_name: "JSS 1" },
    ];

    const result = validateRosterRows(incoming, existing, ["JSS 1", "JSS 2"]);

    assert.strictEqual(result.totalRows, 3);
    assert.strictEqual(result.unchangedCount, 1);
    assert.strictEqual(result.updatedCount, 1);
    assert.strictEqual(result.newCount, 1);
    assert.strictEqual(result.errorCount, 0);

    assert.strictEqual(result.rows[0].action, "UNCHANGED");
    assert.strictEqual(result.rows[1].action, "UPDATE");
    assert.strictEqual(result.rows[2].action, "NEW");
  });

  // 7. Unknown classes detection
  test("Identifies unknown classes not currently in the school", () => {
    const incoming = [
      { rowNumber: 2, admission_number: "001", full_name: "Student A", class_name: "JSS 1" },
      { rowNumber: 3, admission_number: "002", full_name: "Student B", class_name: "Grade 7 Unknown" },
    ];

    const result = validateRosterRows(incoming, [], ["JSS 1"]);
    assert.strictEqual(result.unknownClasses.length, 1);
    assert.strictEqual(result.unknownClasses[0], "Grade 7 Unknown");
  });

  // 8. Mixed admission number lengths warning
  test("Warns when admission numbers have mixed character lengths", () => {
    const incoming = [
      { rowNumber: 2, admission_number: "01", full_name: "Student 1", class_name: "JSS 1" },
      { rowNumber: 3, admission_number: "0002", full_name: "Student 2", class_name: "JSS 1" },
    ];

    const result = validateRosterRows(incoming, [], ["JSS 1"]);
    assert.strictEqual(result.hasMixedAdmissionLengths, true);
    assert.ok(result.warnings.some((w) => w.includes("mixed lengths")));
  });

  // 9. Error report CSV generation
  test("generateErrorReportCsv generates downloadable CSV with error rows only", () => {
    const validatedRows = [
      {
        rowNumber: 2,
        admission_number: "001",
        full_name: "Good Student",
        class_name: "JSS 1",
        action: "NEW" as const,
        errors: [],
      },
      {
        rowNumber: 3,
        admission_number: "",
        full_name: "Bad Student",
        class_name: "JSS 1",
        action: "ERROR" as const,
        errors: ["Admission number is required"],
      },
    ];

    const csvReport = generateErrorReportCsv(validatedRows);
    assert.ok(csvReport.includes("Row,Admission_Number,Full_Name,Class,Errors"));
    assert.ok(csvReport.includes("Admission number is required"));
    assert.ok(!csvReport.includes("Good Student"));
  });
});
