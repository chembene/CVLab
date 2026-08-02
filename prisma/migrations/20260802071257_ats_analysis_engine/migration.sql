-- CreateTable
CREATE TABLE "ats_reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_variant_id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "overall_score" INTEGER NOT NULL,
    "keyword_score" INTEGER NOT NULL,
    "skills_score" INTEGER NOT NULL,
    "experience_score" INTEGER NOT NULL,
    "education_score" INTEGER NOT NULL,
    "language_score" INTEGER NOT NULL,
    "formatting_score" INTEGER NOT NULL,
    "completion_score" INTEGER NOT NULL,
    "matched_keywords" TEXT[],
    "missing_keywords" TEXT[],
    "recommended_skills" TEXT[],
    "recommendations" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ats_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ats_reports_user_id_idx" ON "ats_reports"("user_id");

-- CreateIndex
CREATE INDEX "ats_reports_resume_variant_id_idx" ON "ats_reports"("resume_variant_id");

-- CreateIndex
CREATE INDEX "ats_reports_job_target_id_idx" ON "ats_reports"("job_target_id");

-- AddForeignKey
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ats_reports" ADD CONSTRAINT "ats_reports_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
