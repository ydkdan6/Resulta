import { z } from "zod";

export const CreateDepartmentSchema = z.object({
  school_id: z.string().min(1, "school_id is required."),
  name: z.string().min(1, "name is required.").trim(),
  subject_ids: z.array(z.string().min(1)).optional().default([]),
});
export type CreateDepartmentInput = z.infer<typeof CreateDepartmentSchema>;

export const UpdateDepartmentSchema = z.object({
  name: z.string().min(1, "name cannot be empty.").trim().optional(),
  subject_ids: z.array(z.string().min(1)).optional(),
  is_archived: z.boolean().optional(),
});
export type UpdateDepartmentInput = z.infer<typeof UpdateDepartmentSchema>;

export const AssignStudentDepartmentSchema = z.object({
  department_id: z.string().nullable().optional(),
});
export type AssignStudentDepartmentInput = z.infer<typeof AssignStudentDepartmentSchema>;
