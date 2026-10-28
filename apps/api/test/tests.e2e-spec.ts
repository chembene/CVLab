import type { INestApplication } from '@nestjs/common';
import { Test as NestTest } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TestsService } from '../src/tests/tests.service';
import { TECHNICAL_TEST_SEED } from '../src/tests/seed/technical-tests.seed';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';

/**
 * Covers FASE 23's Technical Tests Engine end-to-end against the real
 * Postgres from docker-compose.yml. Entirely deterministic — no AI, no
 * credits, no AiOrchestrationService involvement anywhere in this module
 * (confirmed by the phase's own audit) — so unlike every AI-feature e2e
 * spec this session has written, there is no feature_pricing seeding, no
 * DummyAIProvider mocking, and no idempotency-key test (nothing here goes
 * through AiOrchestrationService at all). Seeds its own dedicated Test +
 * Questions (never touching the shared TECHNICAL_TEST_SEED catalog rows
 * directly, so this suite can run independently of whether
 * `db:seed:technical-tests` has been run against this database).
 */
describe('Technical Tests Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testsService: TestsService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `tests-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';

  // A small, self-contained fixture test — 2 questions, no time limit, so
  // most of this suite is timer-agnostic. Uses fixed ids scoped to this
  // testRunId, never colliding with the real db:seed:technical-tests catalog
  // or with a parallel run of this same suite. Computed as `const`s at
  // describe-scope (not inside beforeAll) so afterAll's cleanup always has
  // real, defined ids to filter on — even if beforeAll itself times out
  // (the shared, pre-existing "AppModule compile under load" hook-timeout
  // flakiness every e2e spec in this codebase is equally exposed to, per
  // this phase's own audit) — a deleteMany() against ids that were never
  // actually created is always a safe zero-row no-op, never a crash.
  const fixtureTestId = `tests-e2e-${testRunId}-fixture`;
  const questionAId = `${fixtureTestId}-qa`;
  const questionBId = `${fixtureTestId}-qb`;

  // A second, timed fixture test — used only by the expiry-specific tests,
  // so the untimed fixture above never needs a fake "long ago" startedAt.
  const timedTestId = `tests-e2e-${testRunId}-timed`;
  const timedQuestionId = `${timedTestId}-q1`;

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await NestTest.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    testsService = moduleRef.get(TestsService);

    await prisma.test.create({
      data: { id: fixtureTestId, title: 'Fixture Test', category: 'Programming', timeLimit: null },
    });
    await prisma.question.createMany({
      data: [
        {
          id: questionAId,
          testId: fixtureTestId,
          prompt: 'Question A',
          choices: ['Right', 'Wrong'],
          correctAnswer: 'Right',
          explanation: 'Because A.',
        },
        {
          id: questionBId,
          testId: fixtureTestId,
          prompt: 'Question B',
          choices: ['Right', 'Wrong'],
          correctAnswer: 'Right',
          explanation: 'Because B.',
        },
      ],
    });

    await prisma.test.create({
      data: {
        id: timedTestId,
        title: 'Timed Fixture Test',
        category: 'Programming',
        timeLimit: 10,
      },
    });
    await prisma.question.create({
      data: {
        id: timedQuestionId,
        testId: timedTestId,
        prompt: 'Timed question',
        choices: ['Right', 'Wrong'],
        correctAnswer: 'Right',
        explanation: 'Because timed.',
      },
    });
  }, 30000);

  afterAll(async () => {
    try {
      // `prisma` itself is only assigned once beforeAll reaches that line —
      // if it timed out before then, there is nothing to clean up (the
      // fixture rows above were never created either) and no connection to
      // clean up with.
      if (prisma) {
        await prisma.testAnswer.deleteMany({
          where: { question: { testId: { in: [fixtureTestId, timedTestId] } } },
        });
        await prisma.testSession.deleteMany({
          where: { testId: { in: [fixtureTestId, timedTestId] } },
        });
        await prisma.question.deleteMany({
          where: { testId: { in: [fixtureTestId, timedTestId] } },
        });
        await prisma.test.deleteMany({ where: { id: { in: [fixtureTestId, timedTestId] } } });

        const testUsers = await prisma.user.findMany({
          where: { email: { contains: `tests-e2e-${testRunId}` } },
          select: { id: true },
        });
        const userIds = testUsers.map((u) => u.id);
        if (userIds.length > 0) {
          await prisma.$transaction([
            prisma.historyEvent.deleteMany({ where: { userId: { in: userIds } } }),
            prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
            prisma.verificationToken.deleteMany({ where: { userId: { in: userIds } } }),
          ]);
          await prisma.user.deleteMany({ where: { id: { in: userIds } } });
        }
      }
    } finally {
      if (app) await app.close();
      if (throttlerSpy) throttlerSpy.mockRestore();
    }
  });

  async function registerAndLogin(label: string): Promise<{ userId: string; accessToken: string }> {
    const email = emailFor(label);
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PASSWORD });
    return { userId: registerRes.body.data.user.id, accessToken: loginRes.body.data.accessToken };
  }

  async function registerAdmin(label: string): Promise<{ userId: string; accessToken: string }> {
    const account = await registerAndLogin(label);
    await prisma.user.update({ where: { id: account.userId }, data: { role: 'ADMIN' } });
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: emailFor(label), password: PASSWORD });
    return { userId: account.userId, accessToken: loginRes.body.data.accessToken };
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  // ---------------------------------------------------------------------
  // Full happy-path flow (brief §10's own 10-step list)
  // ---------------------------------------------------------------------

  describe('Full attempt flow', () => {
    it('authenticate → list tests → start → answer → complete → result → history, all in one pass', async () => {
      const { userId, accessToken } = await registerAndLogin('happy-path');

      // 2. obtain/select technical test
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/tests')
        .set(auth(accessToken));
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.some((t: { id: string }) => t.id === fixtureTestId)).toBe(true);

      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/tests/${fixtureTestId}`)
        .set(auth(accessToken));
      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.questionCount).toBe(2);

      // 3 + 4. start session, receive questions (never with correctAnswer)
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/tests/${fixtureTestId}/start`)
        .set(auth(accessToken));
      expect(startRes.status).toBe(201);
      const sessionId = startRes.body.data.id;
      expect(startRes.body.data.status).toBe('IN_PROGRESS');
      expect(startRes.body.data.attemptNumber).toBe(1);
      expect(startRes.body.data.questions).toHaveLength(2);
      for (const q of startRes.body.data.questions) {
        expect(q).not.toHaveProperty('correctAnswer');
        expect(q).not.toHaveProperty('explanation');
      }

      // 5. answer questions — one correct, one wrong
      const answerA = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId: questionAId, selectedAnswer: 'Right' });
      expect(answerA.status).toBe(201);
      // Never reveals correctness before completion.
      const answeredQuestionA = answerA.body.data.questions.find(
        (q: { id: string }) => q.id === questionAId,
      );
      expect(answeredQuestionA.isCorrect).toBeNull();
      expect(answeredQuestionA.selectedAnswer).toBe('Right');

      await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId: questionBId, selectedAnswer: 'Wrong' });

      // 6. submit the test
      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/complete`)
        .set(auth(accessToken));
      expect(completeRes.status).toBe(201);
      expect(completeRes.body.data.status).toBe('COMPLETED');

      // 7 + 8. receive result, verify score — 1/2 correct = 50%
      const resultRes = await request(app.getHttpServer())
        .get(`/api/v1/test-sessions/${sessionId}/result`)
        .set(auth(accessToken));
      expect(resultRes.status).toBe(200);
      expect(resultRes.body.data.score).toBe(50);
      const resultQuestionA = resultRes.body.data.questions.find(
        (q: { id: string }) => q.id === questionAId,
      );
      const resultQuestionB = resultRes.body.data.questions.find(
        (q: { id: string }) => q.id === questionBId,
      );
      expect(resultQuestionA.isCorrect).toBe(true);
      expect(resultQuestionA.correctAnswer).toBe('Right');
      expect(resultQuestionA.explanation).toBe('Because A.');
      expect(resultQuestionB.isCorrect).toBe(false);

      // 9. verify history — both the domain-specific attempt list...
      const historyRes = await request(app.getHttpServer())
        .get('/api/v1/test-sessions')
        .set(auth(accessToken));
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data.some((s: { id: string }) => s.id === sessionId)).toBe(true);

      // ...and the generic cross-cutting history_events audit trail.
      const historyEvents = await prisma.historyEvent.findMany({ where: { userId } });
      expect(historyEvents.map((e) => e.eventType)).toEqual(
        expect.arrayContaining([
          'technical_test_session_started',
          'technical_test_answer_submitted',
          'technical_test_session_completed',
        ]),
      );
    }, 20000);

    it('retaking the same test creates a new attempt row, never overwriting the previous one', async () => {
      const { accessToken } = await registerAndLogin('retake');

      const first = await request(app.getHttpServer())
        .post(`/api/v1/tests/${fixtureTestId}/start`)
        .set(auth(accessToken));
      expect(first.body.data.attemptNumber).toBe(1);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/tests/${fixtureTestId}/start`)
        .set(auth(accessToken));
      expect(second.body.data.attemptNumber).toBe(2);
      expect(second.body.data.id).not.toBe(first.body.data.id);
    });

    it('editing an answer before completion overwrites it in place — no duplicate answer rows', async () => {
      const { accessToken } = await registerAndLogin('edit-answer');
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/tests/${fixtureTestId}/start`)
        .set(auth(accessToken));
      const sessionId = startRes.body.data.id;

      await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId: questionAId, selectedAnswer: 'Wrong' });
      await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId: questionAId, selectedAnswer: 'Right' });

      const answers = await prisma.testAnswer.findMany({
        where: { testSessionId: sessionId, questionId: questionAId },
      });
      expect(answers).toHaveLength(1);
      expect(answers[0]!.selectedAnswer).toBe('Right');
    });
  });

  // ---------------------------------------------------------------------
  // Category filter
  // ---------------------------------------------------------------------

  describe('GET /tests?category=', () => {
    it('filters the catalog by category', async () => {
      const { accessToken } = await registerAndLogin('category-filter');
      const res = await request(app.getHttpServer())
        .get('/api/v1/tests?category=Programming')
        .set(auth(accessToken));
      expect(res.status).toBe(200);
      expect(res.body.data.every((t: { category: string }) => t.category === 'Programming')).toBe(
        true,
      );
      expect(res.body.data.some((t: { id: string }) => t.id === fixtureTestId)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------
  // Timer — server-authoritative
  // ---------------------------------------------------------------------

  describe('Timer expiry', () => {
    /** Starts a timed attempt and optionally answers its one question, returning ids. */
    async function startTimedAttempt(label: string, answer?: 'Right' | 'Wrong') {
      const { userId, accessToken } = await registerAndLogin(label);
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/tests/${timedTestId}/start`)
        .set(auth(accessToken));
      const sessionId: string = startRes.body.data.id;
      if (answer) {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/test-sessions/${sessionId}/answer`)
          .set(auth(accessToken))
          .send({ questionId: timedQuestionId, selectedAnswer: answer });
        expect(res.status).toBe(201);
      }
      return { userId, accessToken, sessionId };
    }

    /** Moves startedAt far into the past — the 10-minute limit has long run out. The server, never the client, decides this. */
    async function makeOverdue(sessionId: string): Promise<Date> {
      const startedAt = new Date(Date.now() - 60 * 60_000);
      await prisma.testSession.update({ where: { id: sessionId }, data: { startedAt } });
      return startedAt;
    }

    const completedEventCount = (userId: string) =>
      prisma.historyEvent.count({
        where: { userId, eventType: 'technical_test_session_completed' },
      });

    it('auto-closes an overdue attempt: answers saved before the deadline are scored, the result is persisted, listed, revealed — and no credits move', async () => {
      const { userId, accessToken, sessionId } = await startTimedAttempt('timer-auto', 'Right');
      const startedAt = await makeOverdue(sessionId);
      const deadline = new Date(startedAt.getTime() + 10 * 60_000);

      // The history list is the first thing that touches it: it closes and scores it.
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/test-sessions')
        .set(auth(accessToken));
      const entry = listRes.body.data.find((e: { id: string }) => e.id === sessionId);
      expect(entry.status).toBe('COMPLETED');
      expect(entry.score).toBe(100);
      expect(entry.timedOut).toBe(true);

      // Persisted — not merely displayed — with completedAt stamped as the deadline.
      const row = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(row.status).toBe('COMPLETED');
      expect(row.score).toBe(100);
      expect(row.completedAt?.getTime()).toBe(deadline.getTime());
      expect(await prisma.testAnswer.count({ where: { testSessionId: sessionId } })).toBe(1);

      // Correct answers and explanations are revealed only now that it is closed.
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/test-sessions/${sessionId}`)
        .set(auth(accessToken));
      expect(getRes.body.data.status).toBe('COMPLETED');
      expect(getRes.body.data.timedOut).toBe(true);
      expect(getRes.body.data.remainingSeconds).toBeNull();
      expect(getRes.body.data.questions[0].correctAnswer).toBe('Right');
      expect(getRes.body.data.questions[0].explanation).toBe('Because timed.');
      const resultRes = await request(app.getHttpServer())
        .get(`/api/v1/test-sessions/${sessionId}/result`)
        .set(auth(accessToken));
      expect(resultRes.status).toBe(200);

      // A closed attempt can be neither answered nor submitted again.
      const answerRes = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId: timedQuestionId, selectedAnswer: 'Wrong' });
      expect(answerRes.status).toBe(409);
      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/complete`)
        .set(auth(accessToken));
      expect(completeRes.status).toBe(409);
      const after = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(after.score).toBe(100); // never re-scored
      expect(after.completedAt?.getTime()).toBe(deadline.getTime());

      // One history event, and the feature stayed free.
      expect(await completedEventCount(userId)).toBe(1);
      expect(await prisma.creditTransaction.count({ where: { userId } })).toBe(0);
    }, 30000);

    it('auto-closes an overdue attempt with no answers at all as a 0 score', async () => {
      const { accessToken, sessionId } = await startTimedAttempt('timer-empty');
      await makeOverdue(sessionId);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/test-sessions/${sessionId}`)
        .set(auth(accessToken));
      expect(getRes.body.data.status).toBe('COMPLETED');
      expect(getRes.body.data.score).toBe(0);
      expect(getRes.body.data.timedOut).toBe(true);
    });

    it('an incorrect answer saved before the deadline is scored as incorrect', async () => {
      const { accessToken, sessionId } = await startTimedAttempt('timer-wrong', 'Wrong');
      await makeOverdue(sessionId);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/test-sessions/${sessionId}`)
        .set(auth(accessToken));
      expect(getRes.body.data.score).toBe(0);
      expect(getRes.body.data.questions[0].isCorrect).toBe(false);
    });

    it('rejects an answer sent after the deadline — nothing is persisted — and closes the attempt', async () => {
      const { accessToken, sessionId } = await startTimedAttempt('timer-late-answer');
      await makeOverdue(sessionId);

      const answerRes = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId: timedQuestionId, selectedAnswer: 'Right' });
      expect(answerRes.status).toBe(409);
      expect(await prisma.testAnswer.count({ where: { testSessionId: sessionId } })).toBe(0);

      const row = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(row.status).toBe('COMPLETED');
      expect(row.score).toBe(0); // the late "Right" never counted
    });

    it('a manual submit after the deadline is honoured as the automatic close (deadline timestamp, timed out), exactly once', async () => {
      const { userId, accessToken, sessionId } = await startTimedAttempt(
        'timer-late-submit',
        'Right',
      );
      const startedAt = await makeOverdue(sessionId);

      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/complete`)
        .set(auth(accessToken));
      expect(completeRes.status).toBe(201);
      expect(completeRes.body.data.score).toBe(100);
      expect(completeRes.body.data.timedOut).toBe(true);
      const row = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(row.completedAt?.getTime()).toBe(startedAt.getTime() + 10 * 60_000);

      const again = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/complete`)
        .set(auth(accessToken));
      expect(again.status).toBe(409);
      expect(await completedEventCount(userId)).toBe(1);
    });

    it('a manual submit before the deadline is a normal completion, not timed out', async () => {
      const { accessToken, sessionId } = await startTimedAttempt('timer-in-time', 'Right');

      const completeRes = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/complete`)
        .set(auth(accessToken));
      expect(completeRes.status).toBe(201);
      expect(completeRes.body.data.score).toBe(100);
      expect(completeRes.body.data.timedOut).toBe(false);
    });

    it('a COMPLETED attempt stays COMPLETED and untouched in the list even when its start time is long past the limit', async () => {
      const { accessToken, sessionId } = await startTimedAttempt('timer-completed', 'Right');
      await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/complete`)
        .set(auth(accessToken))
        .expect(201);
      const before = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
      await makeOverdue(sessionId);

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/test-sessions')
        .set(auth(accessToken));
      const entry = listRes.body.data.find((e: { id: string }) => e.id === sessionId);
      expect(entry.status).toBe('COMPLETED');
      const after = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(after.score).toBe(before.score);
      expect(after.completedAt?.getTime()).toBe(before.completedAt?.getTime());
    });

    it('simultaneous requests on one overdue attempt close it exactly once: same result everywhere, one history event', async () => {
      const { userId, accessToken, sessionId } = await startTimedAttempt(
        'timer-concurrent',
        'Right',
      );
      await makeOverdue(sessionId);

      const responses = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          i % 2 === 0
            ? request(app.getHttpServer())
                .get(`/api/v1/test-sessions/${sessionId}`)
                .set(auth(accessToken))
            : request(app.getHttpServer()).get('/api/v1/test-sessions').set(auth(accessToken)),
        ),
      );

      for (const res of responses) expect(res.status).toBe(200);
      const scores = responses.map((res) =>
        Array.isArray(res.body.data)
          ? res.body.data.find((e: { id: string }) => e.id === sessionId).score
          : res.body.data.score,
      );
      expect(new Set(scores)).toEqual(new Set([100]));
      expect(await completedEventCount(userId)).toBe(1);
      expect(
        await prisma.testSession.count({ where: { id: sessionId, status: 'COMPLETED' } }),
      ).toBe(1);
    }, 30000);

    it('simultaneous manual submits: exactly one succeeds, every other gets 409, one history event', async () => {
      const { userId, accessToken, sessionId } = await startTimedAttempt(
        'timer-double-submit',
        'Right',
      );

      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(app.getHttpServer())
            .post(`/api/v1/test-sessions/${sessionId}/complete`)
            .set(auth(accessToken)),
        ),
      );

      const statuses = responses.map((res) => res.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(5);
      expect(await completedEventCount(userId)).toBe(1);
      const row = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
      expect(row.score).toBe(100);
    }, 30000);

    it('answer vs submit race: whichever the server accepts is consistent with the final score — no answer is saved yet unscored, none scored yet unsaved', async () => {
      for (let i = 0; i < 8; i += 1) {
        const { accessToken } = await registerAndLogin(`timer-race-${i}`);
        const startRes = await request(app.getHttpServer())
          .post(`/api/v1/tests/${fixtureTestId}/start`)
          .set(auth(accessToken));
        const sessionId: string = startRes.body.data.id;

        const [answerRes, completeRes] = await Promise.all([
          request(app.getHttpServer())
            .post(`/api/v1/test-sessions/${sessionId}/answer`)
            .set(auth(accessToken))
            .send({ questionId: questionAId, selectedAnswer: 'Right' }),
          request(app.getHttpServer())
            .post(`/api/v1/test-sessions/${sessionId}/complete`)
            .set(auth(accessToken)),
        ]);

        expect(completeRes.status).toBe(201); // the only submit always wins its own close
        const row = await prisma.testSession.findUniqueOrThrow({ where: { id: sessionId } });
        const savedAnswers = await prisma.testAnswer.count({ where: { testSessionId: sessionId } });
        if (answerRes.status === 201) {
          // Saved before the close → must be in the score (1 of 2 correct = 50).
          expect(savedAnswers).toBe(1);
          expect(row.score).toBe(50);
        } else {
          // Arrived after the close → rejected, not saved, not scored.
          expect(answerRes.status).toBe(409);
          expect(savedAnswers).toBe(0);
          expect(row.score).toBe(0);
        }
      }
    }, 60000);

    it('reports a decreasing, never-negative remainingSeconds for an in-progress timed session', async () => {
      const { accessToken } = await registerAndLogin('timer-remaining');
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/tests/${timedTestId}/start`)
        .set(auth(accessToken));
      expect(startRes.body.data.remainingSeconds).toBeGreaterThan(0);
      expect(startRes.body.data.remainingSeconds).toBeLessThanOrEqual(600);
    });
  });

  // ---------------------------------------------------------------------
  // Ownership / authorization
  // ---------------------------------------------------------------------

  describe('Ownership and authorization', () => {
    it('requires authentication on every route', async () => {
      const noAuthResults = await Promise.all([
        request(app.getHttpServer()).get('/api/v1/tests'),
        request(app.getHttpServer()).post(`/api/v1/tests/${fixtureTestId}/start`),
        request(app.getHttpServer()).get('/api/v1/test-sessions'),
      ]);
      for (const res of noAuthResults) {
        expect(res.status).toBe(401);
      }
    });

    it("rejects reading, answering, or completing another user's session with 404", async () => {
      const userA = await registerAndLogin('cross-user-a');
      const userB = await registerAndLogin('cross-user-b');
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/tests/${fixtureTestId}/start`)
        .set(auth(userA.accessToken));
      const sessionId = startRes.body.data.id;

      const getCross = await request(app.getHttpServer())
        .get(`/api/v1/test-sessions/${sessionId}`)
        .set(auth(userB.accessToken));
      expect(getCross.status).toBe(404);

      const answerCross = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/answer`)
        .set(auth(userB.accessToken))
        .send({ questionId: questionAId, selectedAnswer: 'Right' });
      expect(answerCross.status).toBe(404);

      const completeCross = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/complete`)
        .set(auth(userB.accessToken));
      expect(completeCross.status).toBe(404);
    });

    it("an admin can read another user's session via the service-level bypass (self-service-only controller, established pattern)", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAdmin('admin-actor');
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/tests/${fixtureTestId}/start`)
        .set(auth(owner.accessToken));
      const sessionId = startRes.body.data.id;

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const result = await testsService.getOne(adminRequestUser, owner.userId, sessionId);
      expect(result.id).toBe(sessionId);
    });
  });

  // ---------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------

  describe('Error handling', () => {
    it('404s for a non-existent test id', async () => {
      const { accessToken } = await registerAndLogin('invalid-test');
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tests/${randomUUID()}/start`)
        .set(auth(accessToken));
      expect(res.status).toBe(404);
    });

    it('rejects starting an inactive test with 400', async () => {
      const { accessToken } = await registerAndLogin('inactive-test');
      const inactiveTestId = `tests-e2e-${testRunId}-inactive`;
      await prisma.test.create({
        data: { id: inactiveTestId, title: 'Inactive', category: 'Programming', active: false },
      });
      const res = await request(app.getHttpServer())
        .post(`/api/v1/tests/${inactiveTestId}/start`)
        .set(auth(accessToken));
      expect(res.status).toBe(400);
      await prisma.test.delete({ where: { id: inactiveTestId } });
    });

    it("rejects answering a question that does not belong to this session's test", async () => {
      const { accessToken } = await registerAndLogin('wrong-question');
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/tests/${fixtureTestId}/start`)
        .set(auth(accessToken));
      const res = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${startRes.body.data.id}/answer`)
        .set(auth(accessToken))
        .send({ questionId: timedQuestionId, selectedAnswer: 'Right' });
      expect(res.status).toBe(404);
    });

    it('rejects completing an already-completed session with 409', async () => {
      const { accessToken } = await registerAndLogin('double-complete');
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/tests/${fixtureTestId}/start`)
        .set(auth(accessToken));
      const sessionId = startRes.body.data.id;
      await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/complete`)
        .set(auth(accessToken));

      const res = await request(app.getHttpServer())
        .post(`/api/v1/test-sessions/${sessionId}/complete`)
        .set(auth(accessToken));
      expect(res.status).toBe(409);
    });

    it('rejects fetching a result before the session is completed with 409', async () => {
      const { accessToken } = await registerAndLogin('result-too-early');
      const startRes = await request(app.getHttpServer())
        .post(`/api/v1/tests/${fixtureTestId}/start`)
        .set(auth(accessToken));
      const res = await request(app.getHttpServer())
        .get(`/api/v1/test-sessions/${startRes.body.data.id}/result`)
        .set(auth(accessToken));
      expect(res.status).toBe(409);
    });
  });

  // ---------------------------------------------------------------------
  // Seed data integrity — the real, shipped catalog
  // ---------------------------------------------------------------------

  describe('The shipped TECHNICAL_TEST_SEED catalog', () => {
    it('every seed question has a correctAnswer that is one of its own choices', () => {
      for (const test of TECHNICAL_TEST_SEED) {
        for (const question of test.questions) {
          expect(question.choices).toContain(question.correctAnswer);
        }
      }
    });
  });
});
