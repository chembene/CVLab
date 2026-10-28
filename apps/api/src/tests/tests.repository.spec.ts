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
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    };
    const testAnswer = { upsert: jest.fn(), count: jest.fn() };
    const question = { findFirst: jest.fn(), count: jest.fn() };
    const prisma = {
      test,
      testSession,
      testAnswer,
      question,
      // Runs the callback against the same mocks, like a real interactive transaction.
      $transaction: jest.fn((fn: (tx: unknown) => unknown) =>
        fn({ testSession, testAnswer, question }),
      ),
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

  describe('saveAnswerIfOpen()', () => {
    it('upserts on the (testSessionId, questionId) unique constraint when the attempt is still open', async () => {
      const { prisma, testSession, testAnswer } = buildPrismaMock();
      testSession.updateMany.mockResolvedValue({ count: 1 });
      const repository = new TestsRepository(prisma);

      await repository.saveAnswerIfOpen('session-1', 'q1', 'SELECT', true, null);

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

    it('guards the write with a conditional update on status IN_PROGRESS (takes the session row lock)', async () => {
      const { prisma, testSession } = buildPrismaMock();
      testSession.updateMany.mockResolvedValue({ count: 1 });
      const repository = new TestsRepository(prisma);

      await repository.saveAnswerIfOpen('session-1', 'q1', 'SELECT', true, null);

      expect(testSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: 'IN_PROGRESS' },
        data: { updatedAt: expect.any(Date) },
      });
    });

    it('puts the deadline in the same WHERE clause: startedAt must be later than now minus the limit', async () => {
      const { prisma, testSession } = buildPrismaMock();
      testSession.updateMany.mockResolvedValue({ count: 1 });
      const repository = new TestsRepository(prisma);
      const before = Date.now();

      await repository.saveAnswerIfOpen('session-1', 'q1', 'SELECT', true, 10);

      const where = testSession.updateMany.mock.calls[0][0].where;
      expect(where.status).toBe('IN_PROGRESS');
      const cutoff = (where.startedAt.gt as Date).getTime();
      expect(cutoff).toBeGreaterThanOrEqual(before - 10 * 60_000);
      expect(cutoff).toBeLessThanOrEqual(Date.now() - 10 * 60_000);
    });

    it('writes nothing and returns null when the attempt is closed or past its deadline', async () => {
      const { prisma, testSession, testAnswer } = buildPrismaMock();
      testSession.updateMany.mockResolvedValue({ count: 0 });
      const repository = new TestsRepository(prisma);

      const result = await repository.saveAnswerIfOpen('session-1', 'q1', 'SELECT', true, 10);

      expect(result).toBeNull();
      expect(testAnswer.upsert).not.toHaveBeenCalled();
    });
  });

  describe('completeSessionIfOpen()', () => {
    it('flips IN_PROGRESS to COMPLETED conditionally, then scores from the persisted answers, in one transaction', async () => {
      const { prisma, testSession, testAnswer, question } = buildPrismaMock();
      const completedAt = new Date('2026-01-01T10:15:00.000Z');
      testSession.updateMany.mockResolvedValue({ count: 1 });
      testSession.findUniqueOrThrow.mockResolvedValue({ id: 'session-1', testId: 'test-1' });
      testAnswer.count.mockResolvedValue(3);
      question.count.mockResolvedValue(4);
      testSession.update.mockResolvedValue({ id: 'session-1', score: 75 });
      const repository = new TestsRepository(prisma);
      const scoreOf = jest.fn().mockReturnValue(75);

      const result = await repository.completeSessionIfOpen('session-1', completedAt, scoreOf);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(testSession.updateMany).toHaveBeenCalledWith({
        where: { id: 'session-1', status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED', completedAt },
      });
      expect(testAnswer.count).toHaveBeenCalledWith({
        where: { testSessionId: 'session-1', isCorrect: true },
      });
      expect(question.count).toHaveBeenCalledWith({ where: { testId: 'test-1', deletedAt: null } });
      expect(scoreOf).toHaveBeenCalledWith(3, 4);
      expect(testSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { score: 75 },
      });
      expect(result).toEqual({
        session: { id: 'session-1', score: 75 },
        correctCount: 3,
        totalQuestions: 4,
      });
    });

    it('returns null and scores nothing when another caller already closed the attempt (idempotent)', async () => {
      const { prisma, testSession, testAnswer } = buildPrismaMock();
      testSession.updateMany.mockResolvedValue({ count: 0 });
      const repository = new TestsRepository(prisma);
      const scoreOf = jest.fn();

      const result = await repository.completeSessionIfOpen('session-1', new Date(), scoreOf);

      expect(result).toBeNull();
      expect(scoreOf).not.toHaveBeenCalled();
      expect(testAnswer.count).not.toHaveBeenCalled();
      expect(testSession.update).not.toHaveBeenCalled();
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
