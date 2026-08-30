-- CreateEnum
CREATE TYPE "interview_mode" AS ENUM ('RESUME', 'JOB', 'ROLE');

-- CreateEnum
CREATE TYPE "cv_file_type" AS ENUM ('PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "cv_import_status" AS ENUM ('PENDING', 'EXTRACTED', 'CONFIRMED', 'DISCARDED', 'FAILED');

-- CreateEnum
CREATE TYPE "resume_template_category" AS ENUM ('ATS_CLASSIC', 'MODERN', 'EXECUTIVE', 'MINIMAL', 'CREATIVE', 'DEVELOPER', 'FINANCE', 'MARKETING', 'HEALTHCARE', 'ACADEMIC', 'EUROPASS');

-- CreateEnum
CREATE TYPE "cover_letter_template_category" AS ENUM ('PROFESSIONAL', 'EXECUTIVE', 'MODERN', 'CORPORATE', 'CREATIVE', 'MINIMAL', 'ACADEMIC');

-- CreateEnum
CREATE TYPE "template_status" AS ENUM ('ACTIVE', 'DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "application_pipeline_status" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "application_pipeline_step" AS ENUM ('JOB_IMPORT', 'ATS_ANALYSIS', 'OPTIMIZATION', 'SUGGESTION_REVIEW', 'APPLY_SUGGESTIONS', 'COVER_LETTER', 'INTERVIEW_PREP', 'SUMMARY');

-- DropForeignKey
ALTER TABLE "interview_sessions" DROP CONSTRAINT "interview_sessions_job_target_id_fkey";

-- DropForeignKey
ALTER TABLE "interview_sessions" DROP CONSTRAINT "interview_sessions_resume_variant_id_fkey";

-- AlterTable
ALTER TABLE "cover_letters" ADD COLUMN     "template_id" TEXT;

-- AlterTable
ALTER TABLE "interview_sessions" ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "mode" "interview_mode" NOT NULL DEFAULT 'RESUME',
ADD COLUMN     "role" TEXT,
ADD COLUMN     "years_experience" INTEGER,
ALTER COLUMN "resume_variant_id" DROP NOT NULL,
ALTER COLUMN "job_target_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "resume_variants" ADD COLUMN     "template_id" TEXT;

-- CreateTable
CREATE TABLE "resume_variant_versions" (
    "id" TEXT NOT NULL,
    "resume_variant_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "change_summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_variant_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_imports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_type" "cv_file_type" NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "status" "cv_import_status" NOT NULL DEFAULT 'PENDING',
    "raw_text_excerpt" TEXT,
    "extracted_data" JSONB,
    "field_confidence" JSONB,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "master_resume_id" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cv_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "resume_template_category" NOT NULL,
    "preview_image" TEXT,
    "thumbnail" TEXT,
    "is_ats_friendly" BOOLEAN NOT NULL DEFAULT true,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "primary_color" TEXT NOT NULL,
    "secondary_color" TEXT NOT NULL,
    "font" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "supported_sections" TEXT[],
    "status" "template_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cover_letter_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "cover_letter_template_category" NOT NULL,
    "preview_image" TEXT,
    "thumbnail" TEXT,
    "is_ats_friendly" BOOLEAN NOT NULL DEFAULT true,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "primary_color" TEXT NOT NULL,
    "secondary_color" TEXT NOT NULL,
    "font" TEXT NOT NULL,
    "layout" TEXT NOT NULL,
    "supported_sections" TEXT[],
    "status" "template_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cover_letter_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_pipeline_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_variant_id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "ats_report_id" TEXT,
    "optimization_id" TEXT,
    "new_ats_report_id" TEXT,
    "cover_letter_id" TEXT,
    "interview_session_id" TEXT,
    "current_step" "application_pipeline_step" NOT NULL DEFAULT 'JOB_IMPORT',
    "status" "application_pipeline_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "application_pipeline_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resume_variant_versions_resume_variant_id_idx" ON "resume_variant_versions"("resume_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "resume_variant_versions_resume_variant_id_version_number_key" ON "resume_variant_versions"("resume_variant_id", "version_number");

-- CreateIndex
CREATE INDEX "cv_imports_user_id_idx" ON "cv_imports"("user_id");

-- CreateIndex
CREATE INDEX "resume_templates_category_idx" ON "resume_templates"("category");

-- CreateIndex
CREATE INDEX "cover_letter_templates_category_idx" ON "cover_letter_templates"("category");

-- CreateIndex
CREATE INDEX "application_pipeline_sessions_user_id_idx" ON "application_pipeline_sessions"("user_id");

-- CreateIndex
CREATE INDEX "cover_letters_template_id_idx" ON "cover_letters"("template_id");

-- CreateIndex
CREATE INDEX "resume_variants_template_id_idx" ON "resume_variants"("template_id");

-- AddForeignKey
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "resume_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_variant_versions" ADD CONSTRAINT "resume_variant_versions_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "cover_letter_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_imports" ADD CONSTRAINT "cv_imports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_imports" ADD CONSTRAINT "cv_imports_master_resume_id_fkey" FOREIGN KEY ("master_resume_id") REFERENCES "master_resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_pipeline_sessions" ADD CONSTRAINT "application_pipeline_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_pipeline_sessions" ADD CONSTRAINT "application_pipeline_sessions_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_pipeline_sessions" ADD CONSTRAINT "application_pipeline_sessions_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
