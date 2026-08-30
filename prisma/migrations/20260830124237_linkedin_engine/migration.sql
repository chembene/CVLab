-- CreateTable
CREATE TABLE "linkedin_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_role" TEXT,
    "headline" TEXT NOT NULL,
    "about" TEXT NOT NULL,
    "skills" TEXT[],
    "experience_suggestions" TEXT[],
    "recommendations" TEXT[],
    "context_snapshot" JSONB,
    "credits_used" INTEGER NOT NULL DEFAULT 0,
    "ai_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linkedin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "linkedin_profiles_user_id_idx" ON "linkedin_profiles"("user_id");

-- CreateIndex
CREATE INDEX "linkedin_profiles_user_id_created_at_idx" ON "linkedin_profiles"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "linkedin_profiles" ADD CONSTRAINT "linkedin_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
