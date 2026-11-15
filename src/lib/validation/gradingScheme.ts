// src/lib/validation/gradingScheme.ts
import { z } from "zod";

// ---------- parts ----------
export const PartSchema = z.object({
  name: z.string().min(1, "Part name is required").trim(),
  max: z
    .number()
    .int("Max must be a whole number")
    .min(1, "Max must be at least 1")
    .max(100, "Max cannot exceed 100"),
});
export type Part = z.infer<typeof PartSchema>;

// ---------- boundaries ----------
export const BoundarySchema = z.object({
  grade: z.string().min(1, "Grade letter is required").trim(),
  min: z.number().min(0).max(100),
  max: z.number().min(0).max(100),
  remark: z.string().min(1, "Remark is required").trim(),
});
export type Boundary = z.infer<typeof BoundarySchema>;

// ---------- full scheme base object ----------
export const BaseGradingSchemeObject = z.object({
  school_id: z.string().uuid("Invalid school ID"),
  name: z.string().min(1, "Scheme name is required").trim(),
  class_level: z.string().trim().optional(),
  parts: z
    .array(PartSchema)
    .min(1, "At least one score part is required"),
  boundaries: z
    .array(BoundarySchema)
    .min(1, "At least one grade boundary is required"),
});

function applySchemeRefinements<T extends z.ZodType<{
  parts: Part[];
  boundaries: Boundary[];
}>>(schema: T) {
  return schema
    // 1️⃣ Part maxes must sum to exactly 100
    .refine(
      (d) => d.parts.reduce((s, p) => s + p.max, 0) === 100,
      { message: "Part maximums must add up to 100", path: ["parts"] },
    )
    // 2️⃣ Part names must be unique
    .refine(
      (d) => {
        const names = d.parts.map((p) => p.name.toLowerCase());
        return new Set(names).size === names.length;
      },
      { message: "Part names must be unique", path: ["parts"] },
    )
    // 3️⃣ Each boundary: min <= max
    .refine(
      (d) => d.boundaries.every((b) => b.min <= b.max),
      { message: "Each boundary's min must be ≤ its max", path: ["boundaries"] },
    )
    // 4️⃣ Boundaries must cover 0–100 exactly, no gaps, no overlaps
    .refine(
      (d) => {
        const sorted = [...d.boundaries].sort((a, b) => a.min - b.min);
        if (sorted.length === 0) return false;
        if (sorted[0].min !== 0) return false;
        if (sorted[sorted.length - 1].max !== 100) return false;
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i].min !== sorted[i - 1].max + 1) return false;
        }
        return true;
      },
      {
        message:
          "Boundaries must cover 0–100 completely without gaps or overlaps (each boundary's min must equal the previous boundary's max + 1)",
        path: ["boundaries"],
      },
    );
}

export const GradingSchemeSchema = applySchemeRefinements(BaseGradingSchemeObject);
export type GradingSchemeInput = z.infer<typeof GradingSchemeSchema>;

// Schema for PUT (update) – school_id is not editable
export const BaseUpdateGradingSchemeObject = BaseGradingSchemeObject.omit({
  school_id: true,
}).partial({ class_level: true });

export const UpdateGradingSchemeSchema = applySchemeRefinements(BaseUpdateGradingSchemeObject);
export type UpdateGradingSchemeInput = z.infer<typeof UpdateGradingSchemeSchema>;
