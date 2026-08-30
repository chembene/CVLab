-- CreateEnum
CREATE TYPE "optimization_status" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "suggestion_priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "suggestion_type" AS ENUM ('KEYWORD', 'SUMMARY', 'EXPERIENCE', 'SKILL', 'EDUCATION', 'PROJECT', 'ACHIEVEMENT', 'LANGUAGE', 'CERTIFICATION', 'GENERAL');

-- CreateTable
CREATE TABLE "resume_optimizations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_variant_id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "ats_report_id" TEXT NOT NULL,
    "status" "optimization_status" NOT NULL DEFAULT 'PENDING',
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "before_score" INTEGER NOT NULL,
    "predicted_score" INTEGER,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "resume_optimizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optimization_suggestions" (
    "id" TEXT NOT NULL,
    "optimization_id" TEXT NOT NULL,
    "type" "suggestion_type" NOT NULL,
    "section" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reason" TEXT,
    "priority" "suggestion_priority" NOT NULL DEFAULT 'MEDIUM',
    "original_text" TEXT,
    "suggested_text" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "optimization_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resume_optimizations_user_id_idx" ON "resume_optimizations"("user_id");

-- CreateIndex
CREATE INDEX "resume_optimizations_resume_variant_id_idx" ON "resume_optimizations"("resume_variant_id");

-- CreateIndex
CREATE INDEX "optimization_suggestions_optimization_id_idx" ON "optimization_suggestions"("optimization_id");

-- AddForeignKey
ALTER TABLE "resume_optimizations" ADD CONSTRAINT "resume_optimizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_optimizations" ADD CONSTRAINT "resume_optimizations_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_optimizations" ADD CONSTRAINT "resume_optimizations_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_optimizations" ADD CONSTRAINT "resume_optimizations_ats_report_id_fkey" FOREIGN KEY ("ats_report_id") REFERENCES "ats_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "optimization_suggestions" ADD CONSTRAINT "optimization_suggestions_optimization_id_fkey" FOREIGN KEY ("optimization_id") REFERENCES "resume_optimizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
