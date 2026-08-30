-- AlterTable
ALTER TABLE "job_import_metadata" ADD COLUMN     "company_logo_url" TEXT,
ADD COLUMN     "duplicate_of_id" TEXT;

-- CreateIndex
CREATE INDEX "job_import_metadata_source_url_idx" ON "job_import_metadata"("source_url");

-- AddForeignKey
ALTER TABLE "job_import_metadata" ADD CONSTRAINT "job_import_metadata_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "job_import_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;
