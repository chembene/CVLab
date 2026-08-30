-- AlterTable
ALTER TABLE "cover_letters" ADD COLUMN     "theme_overrides" JSONB;

-- AlterTable
ALTER TABLE "resume_variants" ADD COLUMN     "theme_overrides" JSONB;

-- CreateTable
CREATE TABLE "resume_template_favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resume_template_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cover_letter_template_favorites" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cover_letter_template_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resume_template_favorites_user_id_idx" ON "resume_template_favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "resume_template_favorites_user_id_template_id_key" ON "resume_template_favorites"("user_id", "template_id");

-- CreateIndex
CREATE INDEX "cover_letter_template_favorites_user_id_idx" ON "cover_letter_template_favorites"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cover_letter_template_favorites_user_id_template_id_key" ON "cover_letter_template_favorites"("user_id", "template_id");

-- AddForeignKey
ALTER TABLE "resume_template_favorites" ADD CONSTRAINT "resume_template_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_template_favorites" ADD CONSTRAINT "resume_template_favorites_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "resume_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letter_template_favorites" ADD CONSTRAINT "cover_letter_template_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cover_letter_template_favorites" ADD CONSTRAINT "cover_letter_template_favorites_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "cover_letter_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
