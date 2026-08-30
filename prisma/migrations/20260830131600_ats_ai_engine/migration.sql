-- CreateTable
CREATE TABLE "ats_ai_analyses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ats_report_id" TEXT NOT NULL,
    "overall_assessment" TEXT NOT NULL,
    "strengths" TEXT[],
    "priority_issues" JSONB NOT NULL,
    "content_recommendations" JSONB NOT NULL,
    "section_recommendations" JSONB NOT NULL,
    "action_plan" TEXT[],
    "context_snapshot" JSONB,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "ai_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ats_ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ats_ai_analyses_user_id_idx" ON "ats_ai_analyses"("user_id");

-- CreateIndex
CREATE INDEX "ats_ai_analyses_ats_report_id_idx" ON "ats_ai_analyses"("ats_report_id");

-- CreateIndex
CREATE INDEX "ats_ai_analyses_user_id_created_at_idx" ON "ats_ai_analyses"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "ats_ai_analyses" ADD CONSTRAINT "ats_ai_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ats_ai_analyses" ADD CONSTRAINT "ats_ai_analyses_ats_report_id_fkey" FOREIGN KEY ("ats_report_id") REFERENCES "ats_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
