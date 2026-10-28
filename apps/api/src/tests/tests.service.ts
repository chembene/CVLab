import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { TestsRepository, type SessionWithRelations } from './tests.repository';
import { isAnswerCorrect, computeScorePercentage } from './test-scoring.util';
import { isSessionExpired, resolveSessionStatus } from './test-timer.util';
import { buildSessionView, toTechnicalTestSummary } from './technical-test-view.builder';
import type { SubmitTestAnswerDto } from './dto/submit-test-answer.dto';
import type {
  TechnicalTestSummary,
  TestSessionStatus,
  TestSessionView,
} from './interfaces/technical-test.interface';

export interface TestSessionHistoryEntry {
  id: string;
  testId: string;
  testTitle: string;
  testCategory: string | null;
  attemptNumber: number;
  status: TestSessionStatus;
  score: number | null;
  startedAt: Date;
  completedAt: Date | null;
}

type TestEntityType = 'technical_test_session' | 'technical_test_answer';
type TestAction = 'started' | 'submitted' | 'completed';

/**
 * Orchestrates the Technical Tests flow per docs/architecture/technical-tests.md:
 * Test catalog (already-seeded, deterministic, no AI) → TestSession → answer
 * submission → deterministic scoring → completion. Deliberately has NO
 * dependency on AiOrchestrationService or CreditService — per the original
 * roadmap brief (Phase 9), this capability never involved AI, and multiple-
 * choice scoring is exact-match comparison, not a judgment call. Free by
 * design, matching ATS Analysis/CV Import extraction/Job Import's own
 * "deterministic = free" precedent — no AIFeature key, no feature_pricing
 * row, nothing to invent.
 */
@Injectable()
export class TestsService {
  constructor(
    private readonly repository: TestsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listAvailable(category?: string): Promise<TechnicalTestSummary[]> {
    const tests = await this.repository.findActiveTests(category);
    return tests.map((t) => toTechnicalTestSummary(t, t._count.questions));
  }

  async getTest(id: string): Promise<TechnicalTestSummary> {
    const test = await this.repository.findTestWithQuestions(id);
    if (!test) {
      throw new NotFoundException('Technical test not found.');
    }
    return toTechnicalTestSummary(test, test.questions.length);
  }

  /** Creates a new attempt (retakes always allowed — every attempt is its own row, per TestSession's own schema doc comment). Only ever starts against an ACTIVE test with at least one question. */
  async startSession(
    requestingUser: RequestUser,
    targetUserId: string,
    testId: string,
  ): Promise<TestSessionView> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const test = await this.repository.findTestWithQuestions(testId);
    if (!test) {
      throw new NotFoundException('Technical test not found.');
    }
    if (!test.active) {
      throw new BadRequestException('This technical test is no longer available.');
    }
    if (test.questions.length === 0) {
      throw new BadRequestException('This technical test has no questions yet.');
    }

    const attemptNumber = (await this.repository.countAttempts(targetUserId, testId)) + 1;
    const session = await this.repository.createSession(targetUserId, testId, attemptNumber);
    this.emit(targetUserId, session.id, 'started', 'technical_test_session', { testId });

    return buildSessionView({ ...session, test, answers: [] }, test.questions);
  }

  /** "Editable until completion" — resubmitting the same questionId before complete() overwrites the previous answer (upsertAnswer's unique-constraint-backed upsert). Never touches AI or credits. Rejects once the session's own time limit has elapsed — the server, not the client, is authoritative for this check. */
  async submitAnswer(
    requestingUser: RequestUser,
    targetUserId: string,
    sessionId: string,
    dto: SubmitTestAnswerDto,
  ): Promise<TestSessionView> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, sessionId);
    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException('Cannot submit answers after this test has been completed.');
    }
    if (isSessionExpired(session.test.timeLimit, session.startedAt)) {
      throw new ConflictException('Time is up for this test — submit it to receive your result.');
    }

    const question = await this.repository.findQuestionById(dto.questionId);
    if (!question || question.testId !== session.testId) {
      throw new NotFoundException('Question not found in this test.');
    }

    const selectedAnswer = dto.selectedAnswer ?? null;
    const isCorrect = isAnswerCorrect(selectedAnswer, question.correctAnswer);
    await this.repository.upsertAnswer(sessionId, dto.questionId, selectedAnswer, isCorrect);
    this.emit(targetUserId, dto.questionId, 'submitted', 'technical_test_answer', { sessionId });

    return this.getOne(requestingUser, targetUserId, sessionId);
  }

  /** Deterministic scoring only — sums the already-computed per-answer `isCorrect` flags (set at submitAnswer() time) against the test's total question count; an unanswered question counts as incorrect, never excluded. Rejects (409) once the time limit has elapsed: an expired attempt is terminal (derived EXPIRED status), so it can be neither answered nor submitted — start a new attempt instead. */
  async completeSession(
    requestingUser: RequestUser,
    targetUserId: string,
    sessionId: string,
  ): Promise<TestSessionView> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, sessionId);
    if (session.status === 'COMPLETED') {
      throw new ConflictException('This test has already been completed.');
    }
    if (isSessionExpired(session.test.timeLimit, session.startedAt)) {
      throw new ConflictException('This test attempt has expired and can no longer be submitted.');
    }

    const test = await this.repository.findTestWithQuestions(session.testId);
    if (!test) {
      throw new NotFoundException('Technical test not found.');
    }
    const correctCount = session.answers.filter((a) => a.isCorrect).length;
    const score = computeScorePercentage(correctCount, test.questions.length);

    await this.repository.completeSession(sessionId, score);
    this.emit(targetUserId, sessionId, 'completed', 'technical_test_session', {
      score,
      correctCount,
      totalQuestions: test.questions.length,
    });

    return this.getOne(requestingUser, targetUserId, sessionId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    sessionId: string,
  ): Promise<TestSessionView> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedOrThrow(targetUserId, sessionId);
    const test = await this.repository.findTestWithQuestions(session.testId);
    if (!test) {
      throw new NotFoundException('Technical test not found.');
    }
    return buildSessionView(session, test.questions);
  }

  /** Same as getOne(), but only for a COMPLETED session — "retrieve attempt result" per the brief's own documented API contract, distinct from getOne()'s "give me the current state whatever it is". */
  async getResult(
    requestingUser: RequestUser,
    targetUserId: string,
    sessionId: string,
  ): Promise<TestSessionView> {
    const view = await this.getOne(requestingUser, targetUserId, sessionId);
    if (view.status !== 'COMPLETED') {
      throw new ConflictException('This test has not been completed yet.');
    }
    return view;
  }

  async listSessions(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<TestSessionHistoryEntry[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const sessions = await this.repository.findSessionsByUserId(targetUserId);
    return sessions.map((s) => ({
      id: s.id,
      testId: s.testId,
      testTitle: s.test.title,
      testCategory: s.test.category,
      attemptNumber: s.attemptNumber,
      status: resolveSessionStatus(s.status, s.test.timeLimit, s.startedAt),
      score: s.score,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    }));
  }

  private async findOwnedOrThrow(
    targetUserId: string,
    sessionId: string,
  ): Promise<SessionWithRelations> {
    const session = await this.repository.findSessionById(sessionId);
    if (!session || session.userId !== targetUserId) {
      throw new NotFoundException('Test session not found.');
    }
    return session;
  }

  private emit(
    userId: string,
    entityId: string,
    action: TestAction,
    entityType: TestEntityType,
    metadata?: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, entityType, entityId, action, metadata),
    );
  }
}
