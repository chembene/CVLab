/*
  Warnings:

  - You are about to drop the column `evaluation` on the `interview_questions` table. All the data in the column will be lost.
  - You are about to drop the column `interview_id` on the `interview_questions` table. All the data in the column will be lost.
  - You are about to drop the column `question_text` on the `interview_questions` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `interview_questions` table. All the data in the column will be lost.
  - You are about to drop the column `user_answer` on the `interview_questions` table. All the data in the column will be lost.
  - You are about to drop the `interviews` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `category` to the `interview_questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ideal_answer` to the `interview_questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `question` to the `interview_questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `session_id` to the `interview_questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tips` to the `interview_questions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "interview_type" AS ENUM ('GENERAL', 'TECHNICAL', 'BEHAVIORAL', 'MIXED');

-- CreateEnum
CREATE TYPE "interview_difficulty" AS ENUM ('JUNIOR', 'MID', 'SENIOR', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "interview_status" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "question_category" AS ENUM ('BEHAVIORAL', 'TECHNICAL', 'SITUATIONAL', 'CULTURE', 'LEADERSHIP', 'COMMUNICATION');

-- DropForeignKey
ALTER TABLE "interview_questions" DROP CONSTRAINT "interview_questions_interview_id_fkey";

-- DropForeignKey
ALTER TABLE "interviews" DROP CONSTRAINT "interviews_user_id_fkey";

-- DropIndex
DROP INDEX "interview_questions_interview_id_idx";

-- AlterTable
ALTER TABLE "interview_questions" DROP COLUMN "evaluation",
DROP COLUMN "interview_id",
DROP COLUMN "question_text",
DROP COLUMN "score",
DROP COLUMN "user_answer",
ADD COLUMN     "category" "question_category" NOT NULL,
ADD COLUMN     "ideal_answer" TEXT NOT NULL,
ADD COLUMN     "question" TEXT NOT NULL,
ADD COLUMN     "session_id" TEXT NOT NULL,
ADD COLUMN     "tips" TEXT NOT NULL;

-- DropTable
DROP TABLE "interviews";

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_variant_id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "optimization_id" TEXT,
    "cover_letter_id" TEXT,
    "type" "interview_type" NOT NULL,
    "difficulty" "interview_difficulty" NOT NULL,
    "language" TEXT NOT NULL,
    "overall_score" INTEGER,
    "communication_score" INTEGER,
    "technical_score" INTEGER,
    "confidence_score" INTEGER,
    "status" "interview_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_answers" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "score" INTEGER,
    "feedback" TEXT,
    "strengths" JSONB NOT NULL,
    "improvements" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interview_answers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "interview_sessions_user_id_idx" ON "interview_sessions"("user_id");

-- CreateIndex
CREATE INDEX "interview_sessions_resume_variant_id_idx" ON "interview_sessions"("resume_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "interview_answers_question_id_key" ON "interview_answers"("question_id");

-- CreateIndex
CREATE INDEX "interview_questions_session_id_idx" ON "interview_questions"("session_id");

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_optimization_id_fkey" FOREIGN KEY ("optimization_id") REFERENCES "resume_optimizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_cover_letter_id_fkey" FOREIGN KEY ("cover_letter_id") REFERENCES "cover_letters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "interview_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_answers" ADD CONSTRAINT "interview_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "interview_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
