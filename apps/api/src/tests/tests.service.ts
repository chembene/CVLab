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
import { isSessionExpired, sessionDeadline, wasTimedOut } from './test-timer.util';
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
  /** True when the attempt was closed automatically because its time limit ran out. */
  timedOut: boolean;
}

/** The fields settleIfExpired() needs — satisfied by both a full session and a history row. */
interface SettleableSession {
  id: string;
  userId: string;
  status: string;
  startedAt: Date;
  test: { timeLimit: number | null };
}

const CLOSED_MESSAGE =
  'This test attempt is closed (submitted or out of time) and no longer accepts answers.';

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

  /** "Editable until completion" — resubmitting the same questionId before the attempt closes overwrites the previous answer (a unique-constraint-backed upsert). Never touches AI or credits. The server, not the client, is authoritative for the deadline: an overdue attempt is closed and scored first, and a late answer is rejected (409) — the write itself re-checks "still open and inside the time limit" atomically (saveAnswerIfOpen), so no race with a concurrent submit or expiry can let one through. */
  async submitAnswer(
    requestingUser: RequestUser,
    targetUserId: string,
    sessionId: string,
    dto: SubmitTestAnswerDto,
  ): Promise<TestSessionView> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedSettledOrThrow(targetUserId, sessionId);
    if (session.status !== 'IN_PROGRESS') {
      throw new ConflictException(CLOSED_MESSAGE);
    }

    const question = await this.repository.findQuestionById(dto.questionId);
    if (!question || question.testId !== session.testId) {
      throw new NotFoundException('Question not found in this test.');
    }

    const selectedAnswer = dto.selectedAnswer ?? null;
    const isCorrect = isAnswerCorrect(selectedAnswer, question.correctAnswer);
    const saved = await this.repository.saveAnswerIfOpen(
      sessionId,
      dto.questionId,
      selectedAnswer,
      isCorrect,
      session.test.timeLimit,
    );
    if (!saved) {
      // Closed or past the deadline between the read above and the write —
      // make sure an overdue attempt is closed and scored now, then reject.
      await this.settleIfExpired(await this.findOwnedOrThrow(targetUserId, sessionId));
      throw new ConflictException(CLOSED_MESSAGE);
    }
    this.emit(targetUserId, dto.questionId, 'submitted', 'technical_test_answer', { sessionId });

    return this.getOne(requestingUser, targetUserId, sessionId);
  }

  /**
   * Deterministic scoring only — correct answers (flagged at answer time) over the test's total question count; an unanswered question counts as incorrect, never excluded. Closing is a single atomic compare-and-set (completeSessionIfOpen), so concurrent submits cannot produce two results: exactly one caller closes the attempt; any other gets 409 ("cannot be submitted again").
   * If the deadline has already passed when the user submits, the attempt is closed at the deadline with the answers recorded before it — a late submit is honoured as the same automatic close, never scored later or differently — and the result is returned.
   */
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

    const closedByTimeout = isSessionExpired(session.test.timeLimit, session.startedAt);
    const deadline = sessionDeadline(session.test.timeLimit, session.startedAt);
    const closed = await this.repository.completeSessionIfOpen(
      sessionId,
      closedByTimeout && deadline ? deadline : new Date(),
      computeScorePercentage,
    );
    if (!closed) {
      throw new ConflictException('This test has already been completed.');
    }
    this.emitCompleted(targetUserId, sessionId, closed, closedByTimeout);

    return this.getOne(requestingUser, targetUserId, sessionId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    sessionId: string,
  ): Promise<TestSessionView> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const session = await this.findOwnedSettledOrThrow(targetUserId, sessionId);
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

  /** The caller's attempt history. Any overdue attempt in it is closed and scored on the way (see settleIfExpired) — so abandoned attempts show up as completed, with a score, the first time the user looks at their history. */
  async listSessions(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<TestSessionHistoryEntry[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    let sessions = await this.repository.findSessionsByUserId(targetUserId);
    const settled = await Promise.all(sessions.map((s) => this.settleIfExpired(s)));
    if (settled.some(Boolean)) {
      sessions = await this.repository.findSessionsByUserId(targetUserId);
    }
    return sessions.map((s) => ({
      id: s.id,
      testId: s.testId,
      testTitle: s.test.title,
      testCategory: s.test.category,
      attemptNumber: s.attemptNumber,
      status: s.status as TestSessionStatus,
      score: s.score,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      timedOut: wasTimedOut(s.test.timeLimit, s.startedAt, s.completedAt),
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

  /** findOwnedOrThrow(), then closes the attempt if its deadline has passed and re-reads it, so every read/write path sees one consistent, already-scored state. */
  private async findOwnedSettledOrThrow(
    targetUserId: string,
    sessionId: string,
  ): Promise<SessionWithRelations> {
    const session = await this.findOwnedOrThrow(targetUserId, sessionId);
    if (!(await this.settleIfExpired(session))) return session;
    return this.findOwnedOrThrow(targetUserId, sessionId);
  }

  /**
   * Automatic close at the deadline — lazy, with no background job: the first
   * request that touches an overdue IN_PROGRESS attempt closes it, using the
   * deadline as `completedAt` and the answers saved before it. Idempotent and
   * race-safe because the close is completeSessionIfOpen()'s compare-and-set:
   * under any number of concurrent requests exactly one performs it and emits
   * the history event. Returns true when the attempt was overdue (whether this
   * call or a concurrent one closed it), so callers know to re-read.
   */
  private async settleIfExpired(session: SettleableSession): Promise<boolean> {
    if (session.status !== 'IN_PROGRESS') return false;
    const deadline = sessionDeadline(session.test.timeLimit, session.startedAt);
    if (!deadline || !isSessionExpired(session.test.timeLimit, session.startedAt)) return false;

    const closed = await this.repository.completeSessionIfOpen(
      session.id,
      deadline,
      computeScorePercentage,
    );
    if (closed) {
      this.emitCompleted(session.userId, session.id, closed, true);
    }
    return true;
  }

  private emitCompleted(
    userId: string,
    sessionId: string,
    closed: { session: { score: number | null }; correctCount: number; totalQuestions: number },
    timedOut: boolean,
  ): void {
    this.emit(userId, sessionId, 'completed', 'technical_test_session', {
      score: closed.session.score,
      correctCount: closed.correctCount,
      totalQuestions: closed.totalQuestions,
      timedOut,
    });
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
