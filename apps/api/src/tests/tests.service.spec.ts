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
  const HOUR_AGO = new Date(Date.now() - 60 * 60_000); // far past the 10-minute limit

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
      saveAnswerIfOpen: jest.fn().mockResolvedValue({}),
      completeSessionIfOpen: jest.fn().mockResolvedValue({
        session: { ...session, status: 'COMPLETED', score: 100 },
        correctCount: 1,
        totalQuestions: 1,
      }),
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

    it('saves the answer, scored deterministically, and never touches AI/credits', async () => {
      await service.submitAnswer(owner, owner.id, 'session-1', dto);
      expect(repository.saveAnswerIfOpen).toHaveBeenCalledWith(
        'session-1',
        'q1',
        'SELECT',
        true,
        10,
      );
    });

    it('records an incorrect answer when it does not match', async () => {
      await service.submitAnswer(owner, owner.id, 'session-1', {
        questionId: 'q1',
        selectedAnswer: 'INSERT',
      });
      expect(repository.saveAnswerIfOpen).toHaveBeenCalledWith(
        'session-1',
        'q1',
        'INSERT',
        false,
        10,
      );
    });

    it('treats a null/omitted selectedAnswer as incorrect, never rejected', async () => {
      await service.submitAnswer(owner, owner.id, 'session-1', { questionId: 'q1' });
      expect(repository.saveAnswerIfOpen).toHaveBeenCalledWith('session-1', 'q1', null, false, 10);
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

    it('rejects submitting to an already-completed session without writing', async () => {
      repository.findSessionById.mockResolvedValue({ ...session, status: 'COMPLETED' } as never);
      await expect(service.submitAnswer(owner, owner.id, 'session-1', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.saveAnswerIfOpen).not.toHaveBeenCalled();
    });

    it('closes an overdue attempt first, then rejects the late answer without saving it', async () => {
      repository.findSessionById
        .mockResolvedValueOnce({ ...session, startedAt: HOUR_AGO } as never)
        .mockResolvedValue({
          ...session,
          startedAt: HOUR_AGO,
          status: 'COMPLETED',
          score: 0,
        } as never);
      await expect(service.submitAnswer(owner, owner.id, 'session-1', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.completeSessionIfOpen).toHaveBeenCalledTimes(1);
      expect(repository.saveAnswerIfOpen).not.toHaveBeenCalled();
    });

    it('rejects when the attempt closes between the read and the write (atomic guard says no), and closes it if overdue', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: new Date(Date.now() - 10 * 60_000 + 50), // 50 ms before the deadline
      } as never);
      repository.saveAnswerIfOpen.mockResolvedValue(null);
      await expect(service.submitAnswer(owner, owner.id, 'session-1', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ action: 'submitted' }),
      );
    });

    it('never expires a test with no time limit', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: new Date(Date.now() - 24 * 60 * 60_000),
        test: { ...test, timeLimit: null },
      } as never);
      await service.submitAnswer(owner, owner.id, 'session-1', dto);
      expect(repository.saveAnswerIfOpen).toHaveBeenCalledWith(
        'session-1',
        'q1',
        'SELECT',
        true,
        null,
      );
      expect(repository.completeSessionIfOpen).not.toHaveBeenCalled();
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
    it('closes the attempt through the atomic compare-and-set, scoring with the deterministic util', async () => {
      await service.completeSession(owner, owner.id, 'session-1');
      expect(repository.completeSessionIfOpen).toHaveBeenCalledTimes(1);
      const [id, completedAt, scoreOf] = repository.completeSessionIfOpen.mock.calls[0]!;
      expect(id).toBe('session-1');
      expect(Math.abs(completedAt.getTime() - Date.now())).toBeLessThan(5_000); // manual: "now"
      // Unanswered questions count as incorrect: 1 correct of 2 total is 50, not 100.
      expect(scoreOf(1, 2)).toBe(50);
      expect(scoreOf(0, 4)).toBe(0);
    });

    it('emits a "completed" history event with the score, not flagged as timed out', async () => {
      await service.completeSession(owner, owner.id, 'session-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: 'completed',
          metadata: expect.objectContaining({ score: 100, timedOut: false }),
        }),
      );
    });

    it('rejects completing an already-completed session without touching it', async () => {
      repository.findSessionById.mockResolvedValue({ ...session, status: 'COMPLETED' } as never);
      await expect(service.completeSession(owner, owner.id, 'session-1')).rejects.toThrow(
        ConflictException,
      );
      expect(repository.completeSessionIfOpen).not.toHaveBeenCalled();
    });

    it('loses a race gracefully: when another caller closed it first, 409 and no event', async () => {
      repository.completeSessionIfOpen.mockResolvedValue(null);
      await expect(service.completeSession(owner, owner.id, 'session-1')).rejects.toThrow(
        ConflictException,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('rejects a stranger acting on another user', async () => {
      await expect(service.completeSession(stranger, owner.id, 'session-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('submitting after the deadline is honoured as the automatic close: completedAt is the deadline, flagged timed out', async () => {
      const startedAt = HOUR_AGO;
      repository.findSessionById.mockResolvedValue({ ...session, startedAt } as never);
      await service.completeSession(owner, owner.id, 'session-1');
      const [, completedAt] = repository.completeSessionIfOpen.mock.calls[0]!;
      expect(completedAt).toEqual(new Date(startedAt.getTime() + 10 * 60_000));
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          metadata: expect.objectContaining({ timedOut: true }),
        }),
      );
    });

    it('still completes an attempt that is within its time limit', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: new Date(Date.now() - 2 * 60_000), // 2 of 10 minutes used
      } as never);
      await expect(service.completeSession(owner, owner.id, 'session-1')).resolves.toBeDefined();
    });

    it('completes a test with no time limit however long ago it started, never as timed out', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        startedAt: new Date(Date.now() - 24 * 60 * 60_000),
        test: { ...test, timeLimit: null },
      } as never);
      await service.completeSession(owner, owner.id, 'session-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ metadata: expect.objectContaining({ timedOut: false }) }),
      );
    });
  });

  describe('automatic close at the deadline', () => {
    it('getOne closes and scores an overdue attempt, then returns the completed view with answers revealed', async () => {
      const completed = {
        ...session,
        startedAt: HOUR_AGO,
        status: 'COMPLETED',
        score: 100,
        completedAt: new Date(HOUR_AGO.getTime() + 10 * 60_000),
        answers: [{ questionId: 'q1', selectedAnswer: 'SELECT', isCorrect: true, question }],
      };
      repository.findSessionById
        .mockResolvedValueOnce({ ...session, startedAt: HOUR_AGO } as never) // before closing
        .mockResolvedValue(completed as never); // after closing
      const result = await service.getOne(owner, owner.id, 'session-1');
      expect(repository.completeSessionIfOpen).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('COMPLETED');
      expect(result.timedOut).toBe(true);
      expect(result.score).toBe(100);
      expect(result.questions[0]!.correctAnswer).toBe('SELECT');
    });

    it('closes with the deadline as completedAt, so answers saved before it are scored and nothing after it counts', async () => {
      repository.findSessionById.mockResolvedValue({ ...session, startedAt: HOUR_AGO } as never);
      await service.getOne(owner, owner.id, 'session-1');
      const [, completedAt] = repository.completeSessionIfOpen.mock.calls[0]!;
      expect(completedAt).toEqual(new Date(HOUR_AGO.getTime() + 10 * 60_000));
    });

    it('emits exactly one "completed" event (timedOut) for the caller that actually closed it', async () => {
      repository.findSessionById.mockResolvedValue({ ...session, startedAt: HOUR_AGO } as never);
      await service.getOne(owner, owner.id, 'session-1');
      const completedEvents = eventEmitter.emit.mock.calls.filter(
        ([, payload]) => payload?.action === 'completed',
      );
      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0]![1].metadata).toEqual(expect.objectContaining({ timedOut: true }));
    });

    it('emits nothing when a concurrent request already closed it (the compare-and-set returns null)', async () => {
      repository.completeSessionIfOpen.mockResolvedValue(null);
      repository.findSessionById.mockResolvedValue({ ...session, startedAt: HOUR_AGO } as never);
      await service.getOne(owner, owner.id, 'session-1');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('simultaneous requests on one overdue attempt: every caller attempts the close, only one wins, one event in total', async () => {
      repository.completeSessionIfOpen
        .mockResolvedValueOnce({
          session: { ...session, score: 0 },
          correctCount: 0,
          totalQuestions: 1,
        } as never)
        .mockResolvedValue(null);
      repository.findSessionById.mockResolvedValue({ ...session, startedAt: HOUR_AGO } as never);

      await Promise.all([
        service.getOne(owner, owner.id, 'session-1'),
        service.getOne(owner, owner.id, 'session-1'),
        service.getOne(owner, owner.id, 'session-1'),
      ]);

      expect(repository.completeSessionIfOpen).toHaveBeenCalledTimes(3);
      const completedEvents = eventEmitter.emit.mock.calls.filter(
        ([, payload]) => payload?.action === 'completed',
      );
      expect(completedEvents).toHaveLength(1);
    });

    it('an attempt with no answers at all closes with the deterministic score for zero correct (0)', async () => {
      repository.findSessionById.mockResolvedValue({ ...session, startedAt: HOUR_AGO } as never);
      await service.getOne(owner, owner.id, 'session-1');
      const [, , scoreOf] = repository.completeSessionIfOpen.mock.calls[0]!;
      expect(scoreOf(0, 1)).toBe(0);
    });

    it('does not close an attempt that is still inside its time limit', async () => {
      await service.getOne(owner, owner.id, 'session-1');
      expect(repository.completeSessionIfOpen).not.toHaveBeenCalled();
    });

    it('never closes an already-COMPLETED attempt again, however old', async () => {
      repository.findSessionById.mockResolvedValue({
        ...session,
        status: 'COMPLETED',
        score: 75,
        startedAt: HOUR_AGO,
        completedAt: new Date(HOUR_AGO.getTime() + 60_000),
      } as never);
      await service.getOne(owner, owner.id, 'session-1');
      expect(repository.completeSessionIfOpen).not.toHaveBeenCalled();
    });
  });

  describe('getOne / getResult', () => {
    it('getOne returns the sanitized view for an owned session', async () => {
      const result = await service.getOne(owner, owner.id, 'session-1');
      expect(result.id).toBe('session-1');
    });

    it('getOne rejects a stranger', async () => {
      await expect(service.getOne(stranger, owner.id, 'session-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('getResult rejects a session that is still in progress', async () => {
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
        expect.objectContaining({
          id: 'session-1',
          testTitle: 'SQL Básico',
          testCategory: 'SQL',
          status: 'IN_PROGRESS',
          timedOut: false,
        }),
      ]);
      expect(repository.completeSessionIfOpen).not.toHaveBeenCalled();
    });

    it('closes and scores an overdue attempt on the way, then lists it as COMPLETED with its score and timedOut', async () => {
      const deadline = new Date(HOUR_AGO.getTime() + 10 * 60_000);
      repository.findSessionsByUserId
        .mockResolvedValueOnce([{ ...session, startedAt: HOUR_AGO }] as never)
        .mockResolvedValueOnce([
          { ...session, startedAt: HOUR_AGO, status: 'COMPLETED', score: 0, completedAt: deadline },
        ] as never);
      const [entry] = await service.listSessions(owner, owner.id);
      expect(repository.completeSessionIfOpen).toHaveBeenCalledTimes(1);
      expect(entry?.status).toBe('COMPLETED');
      expect(entry?.score).toBe(0);
      expect(entry?.timedOut).toBe(true);
    });

    it('does not re-read the list when nothing was overdue', async () => {
      await service.listSessions(owner, owner.id);
      expect(repository.findSessionsByUserId).toHaveBeenCalledTimes(1);
    });

    it('keeps a COMPLETED attempt as is, however long ago it started, with its score and timedOut false when submitted in time', async () => {
      repository.findSessionsByUserId.mockResolvedValue([
        {
          ...session,
          status: 'COMPLETED',
          score: 75,
          startedAt: HOUR_AGO,
          completedAt: new Date(HOUR_AGO.getTime() + 5 * 60_000),
        },
      ] as never);
      const [entry] = await service.listSessions(owner, owner.id);
      expect(entry?.status).toBe('COMPLETED');
      expect(entry?.score).toBe(75);
      expect(entry?.timedOut).toBe(false);
      expect(repository.completeSessionIfOpen).not.toHaveBeenCalled();
    });

    it('never closes a test without a time limit', async () => {
      repository.findSessionsByUserId.mockResolvedValue([
        {
          ...session,
          startedAt: new Date(Date.now() - 24 * 60 * 60_000),
          test: { ...test, timeLimit: null },
        },
      ] as never);
      const [entry] = await service.listSessions(owner, owner.id);
      expect(entry?.status).toBe('IN_PROGRESS');
      expect(repository.completeSessionIfOpen).not.toHaveBeenCalled();
    });

    it('rejects a stranger acting on another user', async () => {
      await expect(service.listSessions(stranger, owner.id)).rejects.toThrow(ForbiddenException);
    });
  });
});
