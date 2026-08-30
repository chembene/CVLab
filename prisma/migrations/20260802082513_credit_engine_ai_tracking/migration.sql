-- AlterTable
ALTER TABLE "ai_requests" ADD COLUMN     "credits_refunded" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prompt_hash" TEXT,
ADD COLUMN     "provider" TEXT;
