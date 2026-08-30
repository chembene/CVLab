-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "application_pipeline_step" ADD VALUE 'EXPORT';
ALTER TYPE "application_pipeline_step" ADD VALUE 'FINALIZE';

-- AlterTable
ALTER TABLE "application_pipeline_sessions" ADD COLUMN     "application_id" TEXT,
ADD COLUMN     "exported_document_id" TEXT;
