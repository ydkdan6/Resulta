// tests/unit/grading.test.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { evaluateScheme } from "../../src/lib/grading/calculate.ts";
import type { SchemeData } from "../../src/lib/grading/calculate.ts";

// A realistic 3-part scheme: CA1(20) + CA2(20) + Exam(60) = 100
// Boundaries: A(70-100 Excellent), B(55-69 Good), C(40-54 Average), F(0-39 Fail)
const scheme: SchemeData = {
  parts: [
    { name: "CA1", max: 20 },
    { name: "CA2", max: 20 },
    { name: "Exam", max: 60 },
  ],
  boundaries: [
    { grade: "F", min: 0, max: 39, remark: "Fail" },
    { grade: "C", min: 40, max: 54, remark: "Average" },
    { grade: "B", min: 55, max: 69, remark: "Good" },
    { grade: "A", min: 70, max: 100, remark: "Excellent" },
  ],
};

describe("evaluateScheme – unit tests", () => {
  test("Exact boundary match – score of 70 is grade A", () => {
    const result = evaluateScheme(scheme, { CA1: 20, CA2: 10, Exam: 40 });
    assert.strictEqual(result.total, 70);
    assert.strictEqual(result.grade, "A");
    assert.strictEqual(result.remark, "Excellent");
  });

  test("Exact boundary match – score of 55 is grade B (lower boundary)", () => {
    const result = evaluateScheme(scheme, { CA1: 10, CA2: 10, Exam: 35 });
    assert.strictEqual(result.total, 55);
    assert.strictEqual(result.grade, "B");
    assert.strictEqual(result.remark, "Good");
  });

  test("Exact boundary match – score of 69 is grade B (upper boundary)", () => {
    const result = evaluateScheme(scheme, { CA1: 20, CA2: 15, Exam: 34 });
    assert.strictEqual(result.total, 69);
    assert.strictEqual(result.grade, "B");
    assert.strictEqual(result.remark, "Good");
  });

  test("Score of 0 is grade F", () => {
    const result = evaluateScheme(scheme, { CA1: 0, CA2: 0, Exam: 0 });
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.grade, "F");
    assert.strictEqual(result.remark, "Fail");
  });

  test("Perfect score of 100 is grade A", () => {
    const result = evaluateScheme(scheme, { CA1: 20, CA2: 20, Exam: 60 });
    assert.strictEqual(result.total, 100);
    assert.strictEqual(result.grade, "A");
    assert.strictEqual(result.remark, "Excellent");
  });

  test("Missing parts are treated as 0", () => {
    // Only CA1 provided – CA2 and Exam default to 0
    const result = evaluateScheme(scheme, { CA1: 15 });
    assert.strictEqual(result.total, 15);
    assert.strictEqual(result.grade, "F");
    assert.strictEqual(result.remark, "Fail");
  });

  test("No parts provided – total is 0", () => {
    const result = evaluateScheme(scheme, {});
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.grade, "F");
  });

  test("Score above a part max is clamped to max", () => {
    // CA1 submitted as 50 but max is 20 → clamped to 20; total = 20+20+60 = 100
    const result = evaluateScheme(scheme, { CA1: 50, CA2: 20, Exam: 60 });
    assert.strictEqual(result.total, 100);
    assert.strictEqual(result.grade, "A");
  });

  test("All scores above max are clamped – grade is still A", () => {
    const result = evaluateScheme(scheme, { CA1: 999, CA2: 999, Exam: 999 });
    assert.strictEqual(result.total, 100); // clamped to 20+20+60
    assert.strictEqual(result.grade, "A");
  });

  test("Negative score is treated as-is (not clamped upward)", () => {
    // A negative score is unusual but evaluateScheme does not clamp negatives
    // (validation at the input layer handles this). Total = -5 + 0 + 0 = -5
    // No boundary covers -5 → evaluateScheme should throw.
    assert.throws(
      () => evaluateScheme(scheme, { CA1: -5 }),
      /No boundary found for total/,
    );
  });
});
