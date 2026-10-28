-- AlterTable
ALTER TABLE "test_answers" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "test_answers_test_session_id_question_id_key" ON "test_answers"("test_session_id", "question_id");
