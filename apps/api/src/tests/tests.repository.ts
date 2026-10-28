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

  /** One answer per (session, question) — updates in place if the user already answered this question in this session (editable until completion), otherwise creates. Relies on the `@@unique([testSessionId, questionId])` constraint added this phase. */
  upsertAnswer(
    testSessionId: string,
    questionId: string,
    selectedAnswer: string | null,
    isCorrect: boolean,
  ): Promise<TestAnswer> {
    return this.prisma.testAnswer.upsert({
      where: { testSessionId_questionId: { testSessionId, questionId } },
      create: { testSessionId, questionId, selectedAnswer, isCorrect },
      update: { selectedAnswer, isCorrect },
    });
  }

  completeSession(id: string, score: number): Promise<TestSession> {
    return this.prisma.testSession.update({
      where: { id },
      data: { status: 'COMPLETED', score, completedAt: new Date() },
    });
  }

  findQuestionById(id: string): Promise<Question | null> {
    return this.prisma.question.findFirst({ where: { id, deletedAt: null } });
  }
}

/** Re-exported for the seed script and service — matches Prisma's own Json field typing for `Question.choices`. */
export type QuestionChoices = Prisma.JsonArray;
