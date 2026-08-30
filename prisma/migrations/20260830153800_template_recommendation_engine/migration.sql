-- CreateTable
CREATE TABLE "template_recommendations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_variant_id" TEXT,
    "job_target_id" TEXT,
    "summary" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "context_snapshot" JSONB,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "ai_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_recommendations_user_id_idx" ON "template_recommendations"("user_id");

-- CreateIndex
CREATE INDEX "template_recommendations_resume_variant_id_idx" ON "template_recommendations"("resume_variant_id");

-- CreateIndex
CREATE INDEX "template_recommendations_user_id_created_at_idx" ON "template_recommendations"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "template_recommendations" ADD CONSTRAINT "template_recommendations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_recommendations" ADD CONSTRAINT "template_recommendations_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_recommendations" ADD CONSTRAINT "template_recommendations_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
