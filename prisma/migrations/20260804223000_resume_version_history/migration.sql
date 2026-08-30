/*
  Warnings:

  - Added the required column `created_by_user_id` to the `resume_variant_versions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "resume_version_label" AS ENUM ('INITIAL', 'AI_OPTIMIZED', 'MANUAL_EDIT', 'INTERVIEW_VERSION', 'APPLICATION_VERSION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "resume_version_source" AS ENUM ('USER', 'AI');

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "resume_variant_version_id" TEXT;

-- AlterTable
ALTER TABLE "resume_variant_versions" ADD COLUMN     "cover_letter_id" TEXT,
ADD COLUMN     "created_by_user_id" TEXT NOT NULL,
ADD COLUMN     "custom_label" TEXT,
ADD COLUMN     "job_target_id" TEXT,
ADD COLUMN     "label" "resume_version_label" NOT NULL DEFAULT 'MANUAL_EDIT',
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "source" "resume_version_source" NOT NULL DEFAULT 'USER';

-- AddForeignKey
ALTER TABLE "resume_variant_versions" ADD CONSTRAINT "resume_variant_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_variant_versions" ADD CONSTRAINT "resume_variant_versions_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_variant_versions" ADD CONSTRAINT "resume_variant_versions_cover_letter_id_fkey" FOREIGN KEY ("cover_letter_id") REFERENCES "cover_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_variant_version_id_fkey" FOREIGN KEY ("resume_variant_version_id") REFERENCES "resume_variant_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
