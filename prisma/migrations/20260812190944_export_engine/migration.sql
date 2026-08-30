-- CreateEnum
CREATE TYPE "export_format" AS ENUM ('PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "export_status" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "exported_documents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "resume_variant_id" TEXT NOT NULL,
    "resume_variant_version_id" TEXT,
    "format" "export_format" NOT NULL,
    "status" "export_status" NOT NULL DEFAULT 'PENDING',
    "credits_charged" INTEGER NOT NULL DEFAULT 0,
    "credits_refunded" INTEGER NOT NULL DEFAULT 0,
    "idempotency_key" TEXT NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "exported_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exported_documents_idempotency_key_key" ON "exported_documents"("idempotency_key");

-- CreateIndex
CREATE INDEX "exported_documents_user_id_idx" ON "exported_documents"("user_id");

-- CreateIndex
CREATE INDEX "exported_documents_resume_variant_id_idx" ON "exported_documents"("resume_variant_id");

-- AddForeignKey
ALTER TABLE "exported_documents" ADD CONSTRAINT "exported_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exported_documents" ADD CONSTRAINT "exported_documents_resume_variant_id_fkey" FOREIGN KEY ("resume_variant_id") REFERENCES "resume_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exported_documents" ADD CONSTRAINT "exported_documents_resume_variant_version_id_fkey" FOREIGN KEY ("resume_variant_version_id") REFERENCES "resume_variant_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
