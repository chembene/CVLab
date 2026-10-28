/**
 * Seeds the built-in Technical Test catalog (FASE 23) into Postgres.
 * Idempotent — uses `upsert` keyed on the seed data's stable slug `id`s, so
 * re-running this (e.g. after editing a question) updates existing rows
 * instead of duplicating them. Mirrors `prisma/seed-templates.ts`'s (Phase
 * 11) exact pattern.
 *
 * Run with: `npx ts-node --transpile-only prisma/seed-technical-tests.ts`
 * (from the repo root, with `DATABASE_URL` set — see .env).
 */
import { PrismaClient } from '@prisma/client';
import { TECHNICAL_TEST_SEED } from '../apps/api/src/tests/seed/technical-tests.seed';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  let questionCount = 0;
  for (const test of TECHNICAL_TEST_SEED) {
    await prisma.test.upsert({
      where: { id: test.id },
      create: {
        id: test.id,
        title: test.title,
        category: test.category,
        timeLimit: test.timeLimit,
      },
      update: { title: test.title, category: test.category, timeLimit: test.timeLimit },
    });

    for (const question of test.questions) {
      await prisma.question.upsert({
        where: { id: question.id },
        create: {
          id: question.id,
          testId: test.id,
          prompt: question.prompt,
          choices: question.choices,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
        },
        update: {
          prompt: question.prompt,
          choices: question.choices,
          correctAnswer: question.correctAnswer,
          explanation: question.explanation,
        },
      });
      questionCount += 1;
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${TECHNICAL_TEST_SEED.length} technical tests with ${questionCount} questions.`,
  );
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
