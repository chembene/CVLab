/*
  Warnings:

  - You are about to drop the column `resume_id` on the `applications` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "applications" DROP COLUMN "resume_id",
ADD COLUMN     "resume_variant_id" TEXT;

-- CreateTable
CREATE TABLE "resume_variants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "master_resume_id" TEXT NOT NULL,
    "job_target_id" TEXT,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "completion_percentage" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "resume_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resume_variants_user_id_idx" ON "resume_variants"("user_id");

-- CreateIndex
CREATE INDEX "resume_variants_master_resume_id_idx" ON "resume_variants"("master_resume_id");

-- CreateIndex
CREATE INDEX "resume_variants_job_target_id_idx" ON "resume_variants"("job_target_id");

-- CreateIndex
CREATE INDEX "applications_resume_variant_id_idx" ON "applications"("resume_variant_id");

-- AddForeignKey
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_master_resume_id_fkey" FOREIGN KEY ("master_resume_id") REFERENCES "master_resumes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_variants" ADD CONSTRAINT "resume_variants_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
