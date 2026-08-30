-- AlterEnum
ALTER TYPE "job_target_status" ADD VALUE 'REQUIRES_REVIEW';

-- CreateTable
CREATE TABLE "job_import_metadata" (
    "id" TEXT NOT NULL,
    "job_target_id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "raw_html" TEXT NOT NULL,
    "cleaned_description" TEXT NOT NULL,
    "field_confidence" JSONB NOT NULL,
    "overall_confidence" DOUBLE PRECISION NOT NULL,
    "extracted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_import_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_import_metadata_job_target_id_key" ON "job_import_metadata"("job_target_id");

-- AddForeignKey
ALTER TABLE "job_import_metadata" ADD CONSTRAINT "job_import_metadata_job_target_id_fkey" FOREIGN KEY ("job_target_id") REFERENCES "job_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
