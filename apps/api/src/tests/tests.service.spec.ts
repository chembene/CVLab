import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { TestsService } from './tests.service';
import type { TestsRepository } from './tests.repository';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('TestsService', () => {
  let repository: jest.Mocked<TestsRepository>;
  let eventEmitter: { emit: jest.Mock };
  let service: TestsService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const test = {
    id: 'test-1',
    title: 'SQL Básico',
    category: 'SQL',
    timeLimit: 10,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const question = {
    id: 'q1',
    testId: 'test-1',
    prompt: 'Qual comando obtém dados?',
    choices: ['SELECT', 'INSERT'],
    correctAnswer: 'SELECT',
    explanation: 'SELECT consulta dados.',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const testWithQuestions = { ...test, questions: [question] };

  const session = {
    id: 'session-1',
    userId: owner.id,
    testId: test.id,
    attemptNumber: 1,
    status: 'IN_PROGRESS',
    score: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    test,
    answers: [] as unknown[],
  };

  beforeEach(() => {
    repository = {
      findActiveTests: jest.fn().mockResolvedValue([{ ...test, _count: { questions: 1 } }]),
      findTestById: jest.fn().mockResolvedValue(test),
      findTestWithQuestions: jest.fn().mockResolvedValue(testWithQuestions),
      countAttempts: jest.fn().mockResolvedValue(0),
      createSession: jest.fn().mockResolvedValue(session),
      findSessionById: jest.fn().mockResolvedValue(session),
      findSessionsByUserId: jest.fn().mockResolvedValue([session]),
      upsertAnswer: jest.fn().mockResolvedValue({}),
      completeSession: jest.fn().mockResolvedValue({ ...session, status: 'COMPLETED', score: 100 }),
      findQuestionById: jest.fn().mockResolvedValue(question),
    } as unknown as jest.Mocked<TestsRepository>;
    eventEmitter = { emit: jest.fn() };

    service = new TestsService(repository, eventEmitter as never);
  });

  describe('listAvailable', () => {
    it('returns test summaries with their question count', async () => {
      const result = await service.listAvailable();
      expect(result).toEqual([
        { id: 'test-1', title: 'SQL Básico', category: 'SQL', timeLimit: 10, questionCount: 1 },
      ]);
    });

    it('passes the category filter through to the repository', async () => {
      await service.listAvailable('SQL');
      expect(repository.findActiveTests).toHaveBeenCalledWith('SQL');
    });
  });

  describe('getTest', () => {
    it('returns the summary for an existing test', async () => {
      const result = await service.getTest('test-1');
      expect(result.id).toBe('test-1');
    });

    it('throws NotFoundException for a non-existent test', async () => {
      repository.findTestWithQuestions.mockResolvedValue(null);
      await expect(service.getTest('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('startSession', () => {
    it('creates a new session and returns a sanitized view (no correct answers)', async () => {
      const result = await service.startSession(owner, owner.id, 'test-1');
      expect(repository.createSession).toHaveBeenCalledWith(owner.id, 'test-1', 1);
      expect(result.questions[0]).not.toHaveProperty('correctAnswer');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ action: 'started', entityType: 'technical_test_session' }),
      );
    });

    it('computes the next attemptNumber from existing attempts (retakes allowed)', async () => {
      repository.countAttempts.mockResolvedValue(2);
      await service.startSession(owner, owner.id, 'test-1');
      expect(repository.createSession).toHaveBeenCalledWith(owner.id, 'test-1', 3);
    });

    it('rejects a stranger acting on another user', async () => {
      await expect(service.startSession(stranger, owner.id, 'test-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for a non-existent test', async () => {
      repository.findTestWithQuestions.mockResolvedValue(null);
      await expect(service.startSession(owner, owner.id, 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects starting an inactive test', async () => {
      repository.findTestWithQuestions.mockResolvedValue({ ...testWithQuestions, active: false });
      await expect(service.startSession(owner, owner.id, 'test-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects starting a test with no questions', async () => {
      repository.findTestWithQuestions.mockResolvedValue({ ...testWithQuestions, questions: [] });
      await expect(service.startSession(owner, owner.id, 'test-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('submitAnswer', () => {
    const dto = { questionId: 'q1', selectedAnswer: 'SELECT' };

    it('upserts the answer, scored deterministically, and never touches AI/credits', async () => {
      await service.submitAnswer(owner, owner.id, 'session-1', dto);
      expect(repository.upsertAnswer).toHaveBeenCalledWith('session-1', 'q1', 'SELECT', true);
    });

    it('records an incorrect answer when it does not match', async () => {
      await service.submitAnswer(owner, owner.id, 'session-1', {
        questionId: 'q1',
        selectedAnswer: 'INSERT',
      });
      expect(repository.upsertAnswer).toHaveBeenCalledWith('session-1', 'q1', 'INSERT', false);
    });

    it('treats a null/omitted selectedAnswer as incorrect, never rejected', async () => {
      await service.submitAnswer(owner, owner.id, 'session-1', { questionId: 'q1' });
      expect(repository.upsertAnswer).toHaveBeenCalledWith('session-1', 'q1', null, false);
    });

    it('never reveals isCorrect in the returned view before completion', async () => {
      const result = await service.submitAnswer(owner, owner.id, 'session-1', dto);
      expect(result.questions[0]!.isCorrect).toBeNull();
    });

    it('rejects a stranger acting on another user', async () => {
      await expect(service.submitAnswer(stranger, owner.id, 'session-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException for a session owned by someone else', async () => {
      repository.findSessionById.mockResolvedValue({ ...session, userId: 'someone-else' } as never);
      await expect(service.submitAnswer(owner, owner.id, 'session-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects submitting to an already-completed session', async () => {
      repository.findSessionById.mockResolvedValue({ ...session, status: 'COMPLETED' } as never);
      await expect(service.submitAnswer(owner, owner.id, 'session-1', dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects submitting once the time limit has elapsed (server-authoritative)', async () => {
      const longAgo = new Date(Date.now() - 60 * 60_000); // 1 hour ago, timeLimit is 10 minutes
      repository.findSessionById.mockResolvedValue({ ...session, startedAt: longAgo } as never);
      await expect(service.submitAnswer(owner, owner.id, 'session-1', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.upsertAnswer).not.toHaveBeenCalled();
    });

    it('never expires a test with no time limit', async () => {
      const longAgo = new Date(Date.now() - 60 * 60_000);
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: longAgo,
        test: { ...test, timeLimit: null },
      } as never);
      await service.submitAnswer(owner, owner.id, 'session-1', dto);
      expect(repository.upsertAnswer).toHaveBeenCalled();
    });

    it("throws NotFoundException when the question does not belong to this session's test", async () => {
      repository.findQuestionById.mockResolvedValue({ ...question, testId: 'other-test' });
      await expect(service.submitAnswer(owner, owner.id, 'session-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for a non-existent question', async () => {
      repository.findQuestionById.mockResolvedValue(null);
      await expect(service.submitAnswer(owner, owner.id, 'session-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('completeSession', () => {
    it('computes a deterministic score from correct answers and completes the session', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        answers: [{ questionId: 'q1', isCorrect: true, question }],
      } as never);
      await service.completeSession(owner, owner.id, 'session-1');
      expect(repository.completeSession).toHaveBeenCalledWith('session-1', 100);
    });

    it('scores an unanswered question as incorrect, never excluded from the total', async () => {
      repository.findTestWithQuestions.mockResolvedValue({
        ...testWithQuestions,
        questions: [question, { ...question, id: 'q2' }],
      } as never);
      repository.findSessionById.mockResolvedValue({
        ...session,
        answers: [{ questionId: 'q1', isCorrect: true, question }],
      } as never);
      await service.completeSession(owner, owner.id, 'session-1');
      expect(repository.completeSession).toHaveBeenCalledWith('session-1', 50);
    });

    it('emits a "completed" history event with the score', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        answers: [{ questionId: 'q1', isCorrect: true, question }],
      } as never);
      await service.completeSession(owner, owner.id, 'session-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'completed',
          metadata: expect.objectContaining({ score: 100 }),
        }),
      );
    });

    it('rejects completing an already-completed session', async () => {
      repository.findSessionById.mockResolvedValue({ ...session, status: 'COMPLETED' } as never);
      await expect(service.completeSession(owner, owner.id, 'session-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rejects a stranger acting on another user', async () => {
      await expect(service.completeSession(stranger, owner.id, 'session-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects completing an expired attempt — expiry is terminal, nothing is scored or emitted', async () => {
      const longAgo = new Date(Date.now() - 60 * 60_000); // 1 hour ago, timeLimit is 10 minutes
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: longAgo,
        answers: [{ questionId: 'q1', isCorrect: true, question }],
      } as never);
      await expect(service.completeSession(owner, owner.id, 'session-1')).rejects.toThrow(
        ConflictException,
      );
      expect(repository.completeSession).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('still completes an attempt that is within its time limit', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: new Date(Date.now() - 2 * 60_000), // 2 of 10 minutes used
        answers: [{ questionId: 'q1', isCorrect: true, question }],
      } as never);
      await expect(service.completeSession(owner, owner.id, 'session-1')).resolves.toBeDefined();
      expect(repository.completeSession).toHaveBeenCalled();
    });

    it('completes a test with no time limit however long ago it started', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: new Date(Date.now() - 24 * 60 * 60_000),
        test: { ...test, timeLimit: null },
        answers: [{ questionId: 'q1', isCorrect: true, question }],
      } as never);
      await expect(service.completeSession(owner, owner.id, 'session-1')).resolves.toBeDefined();
    });
  });

  describe('getOne / getResult', () => {
    it('getOne returns the sanitized view for an owned session', async () => {
      const result = await service.getOne(owner, owner.id, 'session-1');
      expect(result.id).toBe('session-1');
    });

    it('getOne reports an overdue IN_PROGRESS session as EXPIRED, with 0 seconds left and no answers revealed', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: new Date(Date.now() - 60 * 60_000),
        answers: [{ questionId: 'q1', selectedAnswer: 'SELECT', isCorrect: true, question }],
      } as never);
      const result = await service.getOne(owner, owner.id, 'session-1');
      expect(result.status).toBe('EXPIRED');
      expect(result.remainingSeconds).toBe(0);
      expect(result.questions[0]).not.toHaveProperty('correctAnswer');
      expect(result.questions[0]?.isCorrect).toBeNull();
    });

    it('getResult rejects an expired (never-completed) attempt', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: new Date(Date.now() - 60 * 60_000),
      } as never);
      await expect(service.getResult(owner, owner.id, 'session-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('getOne rejects a stranger', async () => {
      await expect(service.getOne(stranger, owner.id, 'session-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('getResult rejects a session that is not yet completed', async () => {
      await expect(service.getResult(owner, owner.id, 'session-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('getResult succeeds and reveals answers for a completed session', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        status: 'COMPLETED',
        score: 100,
        answers: [{ questionId: 'q1', selectedAnswer: 'SELECT', isCorrect: true, question }],
      } as never);
      const result = await service.getResult(owner, owner.id, 'session-1');
      expect(result.questions[0]!.correctAnswer).toBe('SELECT');
    });
  });

  describe('listSessions', () => {
    it("returns the caller's own attempt history", async () => {
      const result = await service.listSessions(owner, owner.id);
      expect(result).toEqual([
        expect.objectContaining({ id: 'session-1', testTitle: 'SQL Básico', testCategory: 'SQL' }),
      ]);
    });

    it('reports an attempt within its time limit as IN_PROGRESS', async () => {
      repository.findSessionsByUserId.mockResolvedValue([
        { ...session, startedAt: new Date(Date.now() - 2 * 60_000) },
      ] as never);
      const [entry] = await service.listSessions(owner, owner.id);
      expect(entry?.status).toBe('IN_PROGRESS');
    });

    it('reports an attempt past its time limit as EXPIRED, derived from the server clock', async () => {
      repository.findSessionsByUserId.mockResolvedValue([
        { ...session, startedAt: new Date(Date.now() - 60 * 60_000) },
      ] as never);
      const [entry] = await service.listSessions(owner, owner.id);
      expect(entry?.status).toBe('EXPIRED');
    });

    it('keeps a COMPLETED attempt COMPLETED however long ago it started, with its score', async () => {
      repository.findSessionsByUserId.mockResolvedValue([
        {
          ...session,
          status: 'COMPLETED',
          score: 75,
          startedAt: new Date(Date.now() - 60 * 60_000),
        },
      ] as never);
      const [entry] = await service.listSessions(owner, owner.id);
      expect(entry?.status).toBe('COMPLETED');
      expect(entry?.score).toBe(75);
    });

    it('never marks a test without a time limit as EXPIRED', async () => {
      repository.findSessionsByUserId.mockResolvedValue([
        {
          ...session,
          startedAt: new Date(Date.now() - 24 * 60 * 60_000),
          test: { ...test, timeLimit: null },
        },
      ] as never);
      const [entry] = await service.listSessions(owner, owner.id);
      expect(entry?.status).toBe('IN_PROGRESS');
    });

    it('does not write to the database to expire an attempt (display-only)', async () => {
      repository.findSessionsByUserId.mockResolvedValue([
        { ...session, startedAt: new Date(Date.now() - 60 * 60_000) },
      ] as never);
      await service.listSessions(owner, owner.id);
      expect(repository.completeSession).not.toHaveBeenCalled();
    });

    it('rejects a stranger acting on another user', async () => {
      await expect(service.listSessions(stranger, owner.id)).rejects.toThrow(ForbiddenException);
    });
  });
});
