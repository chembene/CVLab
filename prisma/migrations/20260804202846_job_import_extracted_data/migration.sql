/*
  Warnings:

  - Added the required column `extracted_data` to the `job_import_metadata` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "job_import_metadata" ADD COLUMN     "extracted_data" JSONB NOT NULL;
