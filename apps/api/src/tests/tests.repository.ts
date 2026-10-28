import { Injectable } from '@nestjs/common';
import type { Prisma, Question, Test, TestAnswer, TestSession } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type TestWithQuestions = Test & { questions: Question[] };
export type SessionWithRelations = TestSession & {
  test: Test;
  answers: (TestAnswer & { question: Question })[];
};

/** Only Prisma access for `tests`/`questions`/`test_sessions`/`test_answers` lives here. */
@Injectable()
export class TestsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveTests(category?: string): Promise<(Test & { _count: { questions: number } })[]> {
    return this.prisma.test.findMany({
      where: {
        active: true,
        deletedAt: null,
        ...(category ? { category } : {}),
      },
      include: { _count: { select: { questions: { where: { deletedAt: null } } } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findTestById(id: string): Promise<Test | null> {
    return this.prisma.test.findFirst({ where: { id, deletedAt: null } });
  }

  findTestWithQuestions(id: string): Promise<TestWithQuestions | null> {
    return this.prisma.test.findFirst({
      where: { id, deletedAt: null },
      include: { questions: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
    });
  }

  countAttempts(userId: string, testId: string): Promise<number> {
    return this.prisma.testSession.count({ where: { userId, testId } });
  }

  createSession(userId: string, testId: string, attemptNumber: number): Promise<TestSession> {
    return this.prisma.testSession.create({
      data: { userId, testId, attemptNumber, status: 'IN_PROGRESS' },
    });
  }

  findSessionById(id: string): Promise<SessionWithRelations | null> {
    return this.prisma.testSession.findFirst({
      where: { id },
      include: {
        test: true,
        answers: { include: { question: true } },
      },
    });
  }

  findSessionsByUserId(userId: string): Promise<(TestSession & { test: Test })[]> {
    return this.prisma.testSession.findMany({
      where: { userId },
      include: { test: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Records one answer — one row per (session, question), updated in place
   * if already answered (editable until the attempt closes) — but ONLY while
   * the attempt is still open and inside its time limit, decided atomically
   * with the write. The conditional `updateMany` takes the session row's
   * write lock until this transaction commits, so it serializes against
   * completeSessionIfOpen(): an answer either commits before the attempt is
   * closed (and is scored) or finds it closed and writes nothing. The
   * deadline test lives in the same WHERE clause (`startedAt > now - limit`),
   * so a late answer can never slip in between a check and the write.
   * Returns null when the attempt is closed or past its deadline.
   */
  saveAnswerIfOpen(
    testSessionId: string,
    questionId: string,
    selectedAnswer: string | null,
    isCorrect: boolean,
    timeLimitMinutes: number | null,
  ): Promise<TestAnswer | null> {
    return this.prisma.$transaction(async (tx) => {
      const open = await tx.testSession.updateMany({
        where: {
          id: testSessionId,
          status: 'IN_PROGRESS',
          ...(timeLimitMinutes !== null
            ? { startedAt: { gt: new Date(Date.now() - timeLimitMinutes * 60_000) } }
            : {}),
        },
        data: { updatedAt: new Date() },
      });
      if (open.count === 0) return null;
      return tx.testAnswer.upsert({
        where: { testSessionId_questionId: { testSessionId, questionId } },
        create: { testSessionId, questionId, selectedAnswer, isCorrect },
        update: { selectedAnswer, isCorrect },
      });
    });
  }

  /**
   * Closes and scores an attempt exactly once. The `IN_PROGRESS → COMPLETED`
   * flip is a conditional `updateMany`, so of any number of concurrent
   * callers (manual submit, automatic expiry, repeated requests) exactly one
   * gets `count: 1`; every other gets null and writes nothing — no duplicate
   * result, no double event. Status, completion time and score are committed
   * in one transaction, and the score is computed from the answers visible
   * after the row lock is held, i.e. after every earlier saveAnswerIfOpen()
   * has committed. `scoreOf` is passed in so scoring stays in one place
   * (test-scoring.util).
   */
  completeSessionIfOpen(
    sessionId: string,
    completedAt: Date,
    scoreOf: (correctCount: number, totalQuestions: number) => number,
  ): Promise<{ session: TestSession; correctCount: number; totalQuestions: number } | null> {
    return this.prisma.$transaction(async (tx) => {
      const flipped = await tx.testSession.updateMany({
        where: { id: sessionId, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED', completedAt },
      });
      if (flipped.count === 0) return null;

      const current = await tx.testSession.findUniqueOrThrow({ where: { id: sessionId } });
      const [correctCount, totalQuestions] = await Promise.all([
        tx.testAnswer.count({ where: { testSessionId: sessionId, isCorrect: true } }),
        tx.question.count({ where: { testId: current.testId, deletedAt: null } }),
      ]);
      const session = await tx.testSession.update({
        where: { id: sessionId },
        data: { score: scoreOf(correctCount, totalQuestions) },
      });
      return { session, correctCount, totalQuestions };
    });
  }

  findQuestionById(id: string): Promise<Question | null> {
    return this.prisma.question.findFirst({ where: { id, deletedAt: null } });
  }
}

/** Re-exported for the seed script and service — matches Prisma's own Json field typing for `Question.choices`. */
export type QuestionChoices = Prisma.JsonArray;
