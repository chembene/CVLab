-- AlterTable
ALTER TABLE "cv_imports" ADD COLUMN     "ai_request_id" TEXT,
ADD COLUMN     "ai_suggestions" JSONB,
ADD COLUMN     "ai_unresolved_fields" TEXT[] DEFAULT ARRAY[]::TEXT[];
