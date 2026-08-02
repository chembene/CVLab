-- CreateEnum
CREATE TYPE "job_target_status" AS ENUM ('DRAFT', 'READY', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "application_status" AS ENUM ('SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN', 'ARCHIVED');

-- CreateTable
CREATE TABLE "job_targets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "location" TEXT,
    "employment_type" TEXT,
    "seniority" TEXT,
    "salary_min" DECIMAL(12,2),
    "salary_max" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "job_url" TEXT,
    "job_description" TEXT,
    "source" TEXT,
    "status" "job_target_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "job_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_target_keywords" (
    "id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "weight" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_target_keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_target_skills" (
    "id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "skill" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_target_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_target_languages" (
    "id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "level" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_target_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_target_analysis" (
    "id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "ats_score" INTEGER,
    "keywords_matched" TEXT[],
    "keywords_missing" TEXT[],
    "experience_gap" TEXT,
    "education_gap" TEXT,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_target_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "resume_id" TEXT,
    "status" "application_status" NOT NULL DEFAULT 'SAVED',
    "applied_at" TIMESTAMP(3),
    "interview_date" TIMESTAMP(3),
    "result" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_targets_user_id_idx" ON "job_targets"("user_id");

-- CreateIndex
CREATE INDEX "job_target_keywords_job_target_id_idx" ON "job_target_keywords"("job_target_id");

-- CreateIndex
CREATE INDEX "job_target_skills_job_target_id_idx" ON "job_target_skills"("job_target_id");

-- CreateIndex
CREATE INDEX "job_target_languages_job_target_id_idx" ON "job_target_languages"("job_target_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_target_analysis_job_target_id_key" ON "job_target_analysis"("job_target_id");

-- CreateIndex
CREATE INDEX "applications_user_id_idx" ON "applications"("user_id");

-- CreateIndex
CREATE INDEX "applications_job_target_id_idx" ON "applications"("job_target_id");

-- AddForeignKey
ALTER TABLE "job_targets" ADD CONSTRAINT "job_targets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_target_keywords" ADD CONSTRAINT "job_target_keywords_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_target_skills" ADD CONSTRAINT "job_target_skills_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_target_languages" ADD CONSTRAINT "job_target_languages_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_target_analysis" ADD CONSTRAINT "job_target_analysis_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
