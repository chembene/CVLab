/**
 * Seeds the 10 built-in Resume Templates + 7 built-in Cover Letter
 * Templates (Phase 11 Template Engine) into Postgres. Idempotent — uses
 * `upsert` keyed on the seed data's stable slug `id`s, so re-running this
 * (e.g. after editing a template's colors) updates existing rows instead of
 * duplicating them.
 *
 * Run with: `npx ts-node --transpile-only prisma/seed-templates.ts`
 * (from the repo root, with `DATABASE_URL` set — see .env).
 *
 * This closes the same "seed data doesn't exist yet in a fresh environment"
 * gap `credit_packages`/`feature_pricing` were left with (see
 * docs/architecture/database-overview.md, `resume_variants` row) — Template
 * Engine ships with its seed script from day one instead of inheriting it.
 */
import { PrismaClient } from '@prisma/client';
import { RESUME_TEMPLATE_SEED } from '../apps/api/src/template-engine/seed/resume-templates.seed';
import { COVER_LETTER_TEMPLATE_SEED } from '../apps/api/src/template-engine/seed/cover-letter-templates.seed';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  for (const row of RESUME_TEMPLATE_SEED) {
    await prisma.resumeTemplate.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${RESUME_TEMPLATE_SEED.length} resume templates.`);

  for (const row of COVER_LETTER_TEMPLATE_SEED) {
    await prisma.coverLetterTemplate.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    });
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${COVER_LETTER_TEMPLATE_SEED.length} cover letter templates.`);
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
