// src/lib/validation/schemas.ts
import { z } from 'zod';

// ==================== AUTH SCHEMAS ====================
export const LoginSchema = z.object({
  email: z.string().min(1, 'Email is required').trim(),
  password: z.string().min(1, 'Password is required'),
  school_slug: z.string().trim().optional(),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password and new password are required.'),
  newPassword: z
    .string()
    .min(1, 'Current password and new password are required.')
    .min(8, 'New password must be at least 8 characters long.'),
});
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// ==================== PARENT PORTAL SCHEMAS ====================
export const ParentLoginSchema = z.object({
  admissionNumber: z.string().min(1, 'Invalid admission number or PIN.').trim(),
  pin: z.string().min(1, 'Invalid admission number or PIN.').trim(),
  schoolSlug: z.string().trim().optional(),
});
export type ParentLoginInput = z.infer<typeof ParentLoginSchema>;

export const ResultsLoginSchema = z.object({
  schoolSlug: z.string().min(1, 'schoolSlug, admissionNumber, and pin are required.').trim(),
  admissionNumber: z.string().min(1, 'schoolSlug, admissionNumber, and pin are required.').trim(),
  pin: z.string().min(1, 'schoolSlug, admissionNumber, and pin are required.').trim(),
});
export type ResultsLoginInput = z.infer<typeof ResultsLoginSchema>;

export const ParentComplaintSchema = z.object({
  schoolSlug: z
    .string()
    .min(1, 'schoolSlug, studentAdmissionNumber, and message are required.')
    .trim(),
  studentAdmissionNumber: z
    .string()
    .min(1, 'schoolSlug, studentAdmissionNumber, and message are required.')
    .trim(),
  termId: z.string().trim().optional(),
  message: z
    .string()
    .min(1, 'schoolSlug, studentAdmissionNumber, and message are required.')
    .max(3000, 'Message cannot exceed 3000 characters.')
    .trim(),
});
export type ParentComplaintInput = z.infer<typeof ParentComplaintSchema>;

// ==================== STUDENT SCHEMAS ====================
export const CreateStudentSchema = z.object({
  admissionNumber: z.string().min(1, 'Admission number is required.').trim(),
  fullName: z.string().min(1, 'Full name is required.').trim(),
  classId: z.string().min(1, 'Class ID is required.').trim(),
});
export type CreateStudentInput = z.infer<typeof CreateStudentSchema>;

export const UpdateStudentSchema = z.object({
  admissionNumber: z.string().min(1).trim().optional(),
  fullName: z.string().min(1).trim().optional(),
  classId: z.string().min(1).trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'GRADUATED', 'LEFT']).optional(),
});
export type UpdateStudentInput = z.infer<typeof UpdateStudentSchema>;

export const RosterConfirmSchema = z.object({
  schoolId: z.string().min(1, 'School ID is required.'),
  count: z.number().int().min(0, 'Count must be a positive integer.'),
});
export type RosterConfirmInput = z.infer<typeof RosterConfirmSchema>;

// ==================== SCORE SCHEMAS ====================
export const ScoreItemSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  caScore: z.number().nullable().optional(),
  examScore: z.number().nullable().optional(),
  customScores: z.record(z.string(), z.number().nullable().optional()).optional(),
});

export const SaveScoresSchema = z.object({
  classId: z.string().min(1, 'classId, subjectId, termId, and scores array are required.'),
  subjectId: z.string().min(1, 'classId, subjectId, termId, and scores array are required.'),
  termId: z.string().min(1, 'classId, subjectId, termId, and scores array are required.'),
  scores: z.array(z.any()).min(0),
});
export type SaveScoresInput = z.infer<typeof SaveScoresSchema>;

export const SubmitScoresSchema = z.object({
  classId: z.string().min(1, 'classId, subjectId, and termId are required.'),
  subjectId: z.string().min(1, 'classId, subjectId, and termId are required.'),
  termId: z.string().min(1, 'classId, subjectId, and termId are required.'),
  confirmed: z.literal(true, {
    error: 'Confirmation required: Please tick the confirmation box certifying that all scores have been verified twice.',
  }),
  scores: z
    .array(z.any())
    .min(1, 'Scores list cannot be empty for submission.'),
});
export type SubmitScoresInput = z.infer<typeof SubmitScoresSchema>;

export const DeleteScoresSchema = z.object({
  classId: z.string().min(1, 'classId, subjectId, termId, and non-empty studentIds array are required.'),
  subjectId: z.string().min(1, 'classId, subjectId, termId, and non-empty studentIds array are required.'),
  termId: z.string().min(1, 'classId, subjectId, termId, and non-empty studentIds array are required.'),
  studentIds: z
    .array(z.string().min(1))
    .min(1, 'classId, subjectId, termId, and non-empty studentIds array are required.'),
});
export type DeleteScoresInput = z.infer<typeof DeleteScoresSchema>;

export const UnlockScoresSchema = z.object({
  classId: z.string().min(1, 'classId, subjectId, and termId are required.'),
  subjectId: z.string().min(1, 'classId, subjectId, and termId are required.'),
  termId: z.string().min(1, 'classId, subjectId, and termId are required.'),
  reason: z
    .string()
    .trim()
    .min(1, 'A valid reason is required to unlock submitted scores.'),
});
export type UnlockScoresInput = z.infer<typeof UnlockScoresSchema>;

// ==================== PAYMENT & PIN SCHEMAS ====================
export const MarkPaymentsSchema = z.object({
  termId: z.string().min(1, 'termId and a non-empty studentIds array are required.'),
  studentIds: z
    .array(z.string().min(1))
    .min(1, 'termId and a non-empty studentIds array are required.'),
});
export type MarkPaymentsInput = z.infer<typeof MarkPaymentsSchema>;

export const UnmarkPaymentsSchema = z.object({
  termId: z.string().min(1, 'termId and a non-empty studentIds array are required.'),
  studentIds: z
    .array(z.string().min(1))
    .min(1, 'termId and a non-empty studentIds array are required.'),
  reason: z.string().trim().optional(),
});
export type UnmarkPaymentsInput = z.infer<typeof UnmarkPaymentsSchema>;

export const SettlementSchema = z.object({
  schoolId: z.string().min(1, 'schoolId is required.'),
  termId: z.string().min(1, 'termId is required.').optional(),
  amount: z.number({ error: 'amount must be a number.' }),
  date: z.string().min(1, 'date is required.'),
  reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
});
export type SettlementInput = z.infer<typeof SettlementSchema>;

export const WithholdResultSchema = z.object({
  studentId: z.string().min(1, 'studentId, termId, and withheld (boolean) are required.'),
  termId: z.string().min(1, 'studentId, termId, and withheld (boolean) are required.'),
  withheld: z.boolean(),
});
export type WithholdResultInput = z.infer<typeof WithholdResultSchema>;

export const GeneratePinsSchema = z.object({
  termId: z.string().min(1, 'termId is required.'),
  batchId: z.string().optional(),
  studentIds: z.array(z.string().min(1)).optional(),
  returnPdf: z.boolean().optional(),
});
export type GeneratePinsInput = z.infer<typeof GeneratePinsSchema>;

export const ReprintPinSchema = z.object({
  studentId: z.string().min(1, 'studentId and termId are required.'),
  termId: z.string().min(1, 'studentId and termId are required.'),
  reason: z
    .string()
    .min(5, 'A valid reason (minimum 5 characters) is required for reprint.')
    .trim(),
  returnPdf: z.boolean().optional(),
});
export type ReprintPinInput = z.infer<typeof ReprintPinSchema>;

export const ConfirmBatchSchema = z.object({
  amountReceived: z.number().min(0, 'amountReceived must be non-negative').optional(),
});
export type ConfirmBatchInput = z.infer<typeof ConfirmBatchSchema>;

export const UpdateComplaintSchema = z.object({
  status: z.enum(['PENDING', 'RESOLVED', 'DISMISSED'], {
    error: 'Status must be PENDING, RESOLVED, or DISMISSED',
  }),
});
export type UpdateComplaintInput = z.infer<typeof UpdateComplaintSchema>;

// ==================== ADMIN SCHEMAS ====================
export const AdminCreateSchoolSchema = z.object({
  name: z.string().min(1, 'School name is required.').trim(),
  slug: z.string().min(1, 'School slug is required.').trim(),
  card_price: z.number().positive().optional(),
  platform_share: z.number().positive().optional(),
});
export type AdminCreateSchoolInput = z.infer<typeof AdminCreateSchoolSchema>;

export const AdminCreateAdminSchema = z.object({
  name: z.string().min(1, 'Name is required.').trim(),
  email: z.string().email('Invalid email address.').optional().nullable(),
  phone: z.string().optional().nullable(),
  password: z.union([z.string().min(6, 'Password must be at least 6 characters.'), z.literal('')]).optional().nullable(),
});
export type AdminCreateAdminInput = z.infer<typeof AdminCreateAdminSchema>;

export const AdminCreateTeacherSchema = z.object({
  name: z.string().min(1, 'Teacher name is required.').trim(),
  email: z.string().email('Invalid email address.').optional().nullable(),
  phone: z.string().optional().nullable(),
  password: z.union([z.string().min(6, 'Password must be at least 6 characters.'), z.literal('')]).optional().nullable(),
  school_id: z.string().min(1, 'school_id is required.'),
});
export type AdminCreateTeacherInput = z.infer<typeof AdminCreateTeacherSchema>;

export const AdminAssignTeacherSchema = z.object({
  teacher_id: z.string().min(1, 'teacher_id is required.'),
  school_id: z.string().min(1, 'school_id is required.'),
  class_id: z.string().min(1, 'class_id is required.'),
  subject_id: z.string().min(1, 'subject_id is required.'),
});
export type AdminAssignTeacherInput = z.infer<typeof AdminAssignTeacherSchema>;

export const UpdateSchoolSchema = z.object({
  school_id: z.string().min(1, 'school_id is required.').trim(),
  name: z.string().min(1).trim().optional(),
  logo_url: z.string().nullable().optional(),
});
export type UpdateSchoolInput = z.infer<typeof UpdateSchoolSchema>;

export const PinPdfSchema = z.object({
  cards: z.array(z.any()).min(1, 'cards array cannot be empty.'),
  filename: z.string().optional(),
});
export type PinPdfInput = z.infer<typeof PinPdfSchema>;

// ==================== NDPA & DATA PROTECTION SCHEMAS ====================
export const DataDeleteSchema = z.object({
  scope: z.enum(['STUDENT', 'SCHOOL'], {
    error: "scope must be 'STUDENT' or 'SCHOOL'",
  }),
  studentId: z.string().optional(),
  confirmText: z.string().optional(),
  reason: z.string().min(5, 'A valid NDPA processing reason (minimum 5 characters) is required.').trim(),
});
export type DataDeleteInput = z.infer<typeof DataDeleteSchema>;

export const PrivacyNoticeSchema = z.object({
  notice: z.string().min(20, 'Privacy notice must be at least 20 characters long.').trim(),
});
export type PrivacyNoticeInput = z.infer<typeof PrivacyNoticeSchema>;
