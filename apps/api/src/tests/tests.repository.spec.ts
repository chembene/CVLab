import { TestsRepository } from './tests.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('TestsRepository', () => {
  function buildPrismaMock() {
    const test = { findMany: jest.fn(), findFirst: jest.fn() };
    const testSession = {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    };
    const testAnswer = { upsert: jest.fn() };
    const question = { findFirst: jest.fn() };
    const prisma = {
      test,
      testSession,
      testAnswer,
      question,
    } as unknown as jest.Mocked<PrismaService>;
    return { prisma, test, testSession, testAnswer, question };
  }

  it('findActiveTests() filters to active, non-deleted tests, optionally by category', async () => {
    const { prisma, test } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.findActiveTests('SQL');

    expect(test.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, deletedAt: null, category: 'SQL' },
      }),
    );
  });

  it('findActiveTests() omits the category filter when none is given', async () => {
    const { prisma, test } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.findActiveTests();

    expect(test.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true, deletedAt: null } }),
    );
  });

  it('findTestById() excludes soft-deleted tests', async () => {
    const { prisma, test } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.findTestById('test-1');

    expect(test.findFirst).toHaveBeenCalledWith({ where: { id: 'test-1', deletedAt: null } });
  });

  it('findTestWithQuestions() includes only non-deleted questions, ordered by creation', async () => {
    const { prisma, test } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.findTestWithQuestions('test-1');

    expect(test.findFirst).toHaveBeenCalledWith({
      where: { id: 'test-1', deletedAt: null },
      include: { questions: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
    });
  });

  it('countAttempts() counts every session for that user+test', async () => {
    const { prisma, testSession } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.countAttempts('user-1', 'test-1');

    expect(testSession.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', testId: 'test-1' },
    });
  });

  it('createSession() always starts IN_PROGRESS', async () => {
    const { prisma, testSession } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.createSession('user-1', 'test-1', 2);

    expect(testSession.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', testId: 'test-1', attemptNumber: 2, status: 'IN_PROGRESS' },
    });
  });

  it('upsertAnswer() keys on the (testSessionId, questionId) unique constraint', async () => {
    const { prisma, testAnswer } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.upsertAnswer('session-1', 'q1', 'SELECT', true);

    expect(testAnswer.upsert).toHaveBeenCalledWith({
      where: { testSessionId_questionId: { testSessionId: 'session-1', questionId: 'q1' } },
      create: {
        testSessionId: 'session-1',
        questionId: 'q1',
        selectedAnswer: 'SELECT',
        isCorrect: true,
      },
      update: { selectedAnswer: 'SELECT', isCorrect: true },
    });
  });

  it('completeSession() sets status COMPLETED, the score, and completedAt', async () => {
    const { prisma, testSession } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.completeSession('session-1', 80);

    expect(testSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { status: 'COMPLETED', score: 80, completedAt: expect.any(Date) },
    });
  });

  it('findSessionsByUserId() orders most-recent-first', async () => {
    const { prisma, testSession } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.findSessionsByUserId('user-1');

    expect(testSession.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      include: { test: true },
      orderBy: { startedAt: 'desc' },
    });
  });

  it('findQuestionById() excludes soft-deleted questions', async () => {
    const { prisma, question } = buildPrismaMock();
    const repository = new TestsRepository(prisma);

    await repository.findQuestionById('q1');

    expect(question.findFirst).toHaveBeenCalledWith({ where: { id: 'q1', deletedAt: null } });
  });
});
