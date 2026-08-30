-- CreateTable
CREATE TABLE "career_advice" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "current_assessment" TEXT NOT NULL,
    "strengths" TEXT[],
    "gaps" TEXT[],
    "recommendations" TEXT[],
    "next_steps" TEXT[],
    "context_snapshot" JSONB,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "ai_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_advice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "career_advice_user_id_idx" ON "career_advice"("user_id");

-- CreateIndex
CREATE INDEX "career_advice_user_id_created_at_idx" ON "career_advice"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "career_advice" ADD CONSTRAINT "career_advice_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
