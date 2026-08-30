-- CreateEnum
CREATE TYPE "cover_letter_status" AS ENUM ('DRAFT', 'GENERATED', 'EDITED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "cover_letter_tone" AS ENUM ('PROFESSIONAL', 'MODERN', 'EXECUTIVE', 'TECHNICAL', 'FRIENDLY');

-- CreateTable
CREATE TABLE "cover_letters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_variant_id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "optimization_id" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tone" "cover_letter_tone" NOT NULL,
    "language" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "cover_letter_status" NOT NULL DEFAULT 'DRAFT',
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "generated_by_ai" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cover_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cover_letters_user_id_idx" ON "cover_letters"("user_id");

-- CreateIndex
CREATE INDEX "cover_letters_resume_variant_id_idx" ON "cover_letters"("resume_variant_id");

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_optimization_id_fkey" FOREIGN KEY ("optimization_id") REFERENCES "resume_optimizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
