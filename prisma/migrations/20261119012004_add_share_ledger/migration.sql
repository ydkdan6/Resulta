-- CreateEnum
CREATE TYPE "ShareLedgerEntryType" AS ENUM ('SHARE_DUE', 'REVERSAL', 'SETTLEMENT');

-- AlterTable
ALTER TABLE "StudentImport" ADD COLUMN     "active_student_count" INTEGER,
ADD COLUMN     "expected_share" DECIMAL(12,2),
ADD COLUMN     "expected_total" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "ShareLedgerEntry" (
    "id" TEXT NOT NULL,
    "school_id" TEXT NOT NULL,
    "student_id" TEXT,
    "term_id" TEXT,
    "type" "ShareLedgerEntryType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "marked_by_user_id" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShareLedgerEntry_school_id_created_at_idx" ON "ShareLedgerEntry"("school_id", "created_at");

-- CreateIndex
CREATE INDEX "ShareLedgerEntry_term_id_idx" ON "ShareLedgerEntry"("term_id");

-- CreateIndex
CREATE INDEX "ShareLedgerEntry_school_id_type_idx" ON "ShareLedgerEntry"("school_id", "type");

-- CreateIndex
CREATE INDEX "ShareLedgerEntry_student_id_term_id_idx" ON "ShareLedgerEntry"("student_id", "term_id");

-- CreateIndex
CREATE INDEX "Complaint_school_id_status_idx" ON "Complaint"("school_id", "status");

-- CreateIndex
CREATE INDEX "GradingScheme_school_id_class_level_idx" ON "GradingScheme"("school_id", "class_level");

-- CreateIndex
CREATE INDEX "PaymentBatch_school_id_term_id_status_idx" ON "PaymentBatch"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "Pin_school_id_student_id_idx" ON "Pin"("school_id", "student_id");

-- CreateIndex
CREATE INDEX "Pin_school_id_term_id_idx" ON "Pin"("school_id", "term_id");

-- CreateIndex
CREATE INDEX "Pin_student_id_status_idx" ON "Pin"("student_id", "status");

-- CreateIndex
CREATE INDEX "Result_school_id_term_id_status_idx" ON "Result"("school_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "Result_student_id_term_id_status_idx" ON "Result"("student_id", "term_id", "status");

-- CreateIndex
CREATE INDEX "Result_school_id_subject_id_term_id_idx" ON "Result"("school_id", "subject_id", "term_id");

-- CreateIndex
CREATE INDEX "Student_school_id_class_id_idx" ON "Student"("school_id", "class_id");

-- CreateIndex
CREATE INDEX "Student_school_id_status_idx" ON "Student"("school_id", "status");

-- CreateIndex
CREATE INDEX "StudentTermStatus_school_id_term_id_fees_paid_idx" ON "StudentTermStatus"("school_id", "term_id", "fees_paid");

-- CreateIndex
CREATE INDEX "StudentTermStatus_student_id_term_id_result_locked_idx" ON "StudentTermStatus"("student_id", "term_id", "result_locked");

-- CreateIndex
CREATE INDEX "Term_school_id_status_idx" ON "Term"("school_id", "status");

-- AddForeignKey
ALTER TABLE "ShareLedgerEntry" ADD CONSTRAINT "ShareLedgerEntry_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLedgerEntry" ADD CONSTRAINT "ShareLedgerEntry_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLedgerEntry" ADD CONSTRAINT "ShareLedgerEntry_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLedgerEntry" ADD CONSTRAINT "ShareLedgerEntry_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
