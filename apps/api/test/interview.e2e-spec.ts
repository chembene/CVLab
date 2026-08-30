import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreditService } from '../src/credits/credit.service';
import { ProviderRegistry } from '../src/ai-orchestration/providers/provider-registry';
import { DummyAIProvider } from '../src/ai-orchestration/providers/dummy-ai-provider';
import { ProviderUnavailableError } from '../src/ai-orchestration/errors/provider-unavailable.error';
import { AIFeature } from '../src/ai-orchestration/constants/ai-feature.enum';
import { InterviewService } from '../src/interview/interview.service';
import type {
  AIProvider,
  CostEstimate,
  GenerateRequest,
  GenerateResult,
  ProviderHealthStatus,
  StreamChunk,
} from '../src/ai-orchestration/interfaces/ai-provider.interface';
import { bootstrapTestApp } from './utils/bootstrap-test-app';
import { disableThrottlingForTests } from './utils/disable-throttling-for-tests';
import { waitForHistoryEventTypes } from './utils/wait-for-history-events';

/**
 * Covers the Phase 9 AI Interview Preparation Engine end-to-end against the
 * real Postgres/Redis from docker-compose.yml — no repository mocks
 * anywhere in this file, per this phase's brief. Mirrors
 * resume-optimization.e2e-spec.ts (Phase 7) and cover-letter.e2e-spec.ts
 * (Phase 8)'s structure and techniques exactly, including temporarily
 * re-registering broken/flaky test doubles under the registry key "dummy"
 * (restored immediately after) to prove the invalid-JSON, credit-refund,
 * and retry paths for BOTH AI steps (question generation and evaluation)
 * without needing DummyAIProvider itself to ever misbehave. The real
 * (unswapped) DummyAIProvider is used for every happy-path test — its
 * array-count-aware JSON envelope (Phase 9 addition, see
 * ai-orchestration.md §2) already produces correctly-shaped, correctly-sized
 * questions/evaluations, so no custom "valid JSON" double is needed here.
 */
describe('Interview Preparation Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let providerRegistry: ProviderRegistry;
  let interviewService: InterviewService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `interview-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  const QUESTIONS_FEATURE = AIFeature.INTERVIEW_QUESTIONS;
  const EVALUATION_FEATURE = AIFeature.INTERVIEW_EVALUATION;
  // FASE 11 — Modes JOB/ROLE, each its own price point.
  const QUESTIONS_JOB_FEATURE = AIFeature.INTERVIEW_QUESTIONS_JOB;
  const EVALUATION_JOB_FEATURE = AIFeature.INTERVIEW_EVALUATION_JOB;
  const QUESTIONS_ROLE_FEATURE = AIFeature.INTERVIEW_QUESTIONS_ROLE;
  const EVALUATION_ROLE_FEATURE = AIFeature.INTERVIEW_EVALUATION_ROLE;

  class BrokenJsonProvider implements AIProvider {
    readonly name = 'dummy';
    async generate(_request: GenerateRequest): Promise<GenerateResult> {
      return {
        text: 'this is not valid json {{{',
        provider: this.name,
        model: 'dummy-v1',
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
        requestId: `broken-${randomUUID()}`,
      };
    }
    async *stream(): AsyncIterable<StreamChunk> {
      yield { delta: '', done: true };
    }
    async health(): Promise<ProviderHealthStatus> {
      return { provider: this.name, available: true, checkedAt: new Date() };
    }
    async countTokens(text: string): Promise<number> {
      return text.length;
    }
    async estimateCost(): Promise<CostEstimate> {
      return {
        provider: this.name,
        model: 'dummy-v1',
        estimatedCost: 0,
        currency: 'USD',
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }
    supportedModels(): string[] {
      return ['dummy-v1'];
    }
  }

  class FlakyThenValidProvider implements AIProvider {
    readonly name = 'dummy';
    callCount = 0;
    private readonly real = new DummyAIProvider();
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      this.callCount += 1;
      if (this.callCount < 3) {
        throw new ProviderUnavailableError('dummy');
      }
      return this.real.generate(request);
    }
    async *stream(): AsyncIterable<StreamChunk> {
      yield { delta: '', done: true };
    }
    async health(): Promise<ProviderHealthStatus> {
      return { provider: this.name, available: true, checkedAt: new Date() };
    }
    async countTokens(text: string): Promise<number> {
      return text.length;
    }
    async estimateCost(): Promise<CostEstimate> {
      return {
        provider: this.name,
        model: 'dummy-v1',
        estimatedCost: 0,
        currency: 'USD',
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }
    supportedModels(): string[] {
      return ['dummy-v1'];
    }
  }

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    creditService = moduleRef.get(CreditService);
    providerRegistry = moduleRef.get(ProviderRegistry);
    interviewService = moduleRef.get(InterviewService);

    await prisma.featurePricing.createMany({
      data: [
        { featureKey: QUESTIONS_FEATURE, cost: 30, active: true },
        { featureKey: EVALUATION_FEATURE, cost: 30, active: true },
        // FASE 11 — Modes JOB (25/25) and ROLE (20/20).
        { featureKey: QUESTIONS_JOB_FEATURE, cost: 25, active: true },
        { featureKey: EVALUATION_JOB_FEATURE, cost: 25, active: true },
        { featureKey: QUESTIONS_ROLE_FEATURE, cost: 20, active: true },
        { featureKey: EVALUATION_ROLE_FEATURE, cost: 20, active: true },
        // Needed because one test below also calls POST /resume-optimization/run
        // to obtain a real optimizationId — that endpoint requires its own
        // feature_pricing row to exist, same gap flagged since Phase 5.
        { featureKey: AIFeature.RESUME_OPTIMIZATION, cost: 80, active: true },
      ],
    });
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `interview-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        const sessions = await prisma.interviewSession.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const sessionIds = sessions.map((s) => s.id);
        if (sessionIds.length > 0) {
          const questions = await prisma.interviewQuestion.findMany({
            where: { sessionId: { in: sessionIds } },
            select: { id: true },
          });
          const questionIds = questions.map((q) => q.id);
          if (questionIds.length > 0) {
            await prisma.interviewAnswer.deleteMany({ where: { questionId: { in: questionIds } } });
          }
          await prisma.interviewQuestion.deleteMany({ where: { sessionId: { in: sessionIds } } });
        }
        await prisma.interviewSession.deleteMany({ where: { userId: { in: userIds } } });

        const resumes = await prisma.masterResume.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const resumeIds = resumes.map((r) => r.id);
        const variants = await prisma.resumeVariant.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const variantIds = variants.map((v) => v.id);

        // FK order (Phase 10.5): applications reference both a
        // ResumeVariant and a ResumeVariantVersion; version rows reference
        // their ResumeVariant AND (optionally) a CoverLetter. Delete
        // applications and version rows before CoverLetter/ResumeVariant —
        // none of these relations cascade on delete.
        await prisma.application.deleteMany({ where: { userId: { in: userIds } } });
        if (variantIds.length > 0) {
          await prisma.resumeVariantVersion.deleteMany({
            where: { resumeVariantId: { in: variantIds } },
          });
        }
        await prisma.coverLetter.deleteMany({ where: { userId: { in: userIds } } });

        const optimizations = await prisma.resumeOptimization.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const optimizationIds = optimizations.map((o) => o.id);
        if (optimizationIds.length > 0) {
          await prisma.optimizationSuggestion.deleteMany({
            where: { optimizationId: { in: optimizationIds } },
          });
        }
        await prisma.resumeOptimization.deleteMany({ where: { userId: { in: userIds } } });

        await prisma.$transaction([
          prisma.atsReport.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.resumeVariant.deleteMany({ where: { userId: { in: userIds } } }),
        ]);

        if (resumeIds.length > 0) {
          await prisma.$transaction([
            prisma.workExperience.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.education.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.skill.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.language.deleteMany({ where: { resumeId: { in: resumeIds } } }),
          ]);
        }

        const jobTargets = await prisma.jobTarget.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const jobTargetIds = jobTargets.map((jt) => jt.id);
        if (jobTargetIds.length > 0) {
          await prisma.$transaction([
            prisma.jobTargetKeyword.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
            prisma.jobTargetSkill.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
            prisma.jobTargetLanguage.deleteMany({ where: { jobTargetId: { in: jobTargetIds } } }),
          ]);
        }

        await prisma.$transaction([
          prisma.jobTarget.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.masterResume.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.profile.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.aiRequest.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.creditTransaction.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.creditWallet.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.historyEvent.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } }),
          prisma.session.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.verificationToken.deleteMany({ where: { userId: { in: userIds } } }),
        ]);
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.featurePricing.deleteMany({
        where: {
          featureKey: {
            in: [
              QUESTIONS_FEATURE,
              EVALUATION_FEATURE,
              QUESTIONS_JOB_FEATURE,
              EVALUATION_JOB_FEATURE,
              QUESTIONS_ROLE_FEATURE,
              EVALUATION_ROLE_FEATURE,
              AIFeature.RESUME_OPTIMIZATION,
            ],
          },
        },
      });
    } finally {
      await app.close();
      throttlerSpy.mockRestore();
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

  async function grantCredits(userId: string, amount: number, label: string): Promise<void> {
    await creditService.adjustBalance(userId, {
      userId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
      reason: 'Test fixture setup',
      idempotencyKey: `${label}-grant-${randomUUID()}`,
    });
  }

  async function setUpVariantWithLinkedJobTarget(
    accessToken: string,
  ): Promise<{ variantId: string; jobTargetId: string }> {
    await request(app.getHttpServer()).post('/api/v1/resume').set(auth(accessToken)).send({
      title: 'My Resume',
      summary:
        'Experienced backend engineer who has shipped several Power BI dashboards for clients.',
      yearsExperience: 6,
    });
    await request(app.getHttpServer())
      .post('/api/v1/resume/skills')
      .set(auth(accessToken))
      .send({ name: 'TypeScript' });
    await request(app.getHttpServer())
      .post('/api/v1/resume/languages')
      .set(auth(accessToken))
      .send({ language: 'English' });
    await request(app.getHttpServer())
      .post('/api/v1/resume/work-experience')
      .set(auth(accessToken))
      .send({
        company: 'Acme',
        position: 'Engineer',
        startDate: '2020-01-01',
        description: 'Led the backend team.',
      });
    await request(app.getHttpServer())
      .post('/api/v1/resume/education')
      .set(auth(accessToken))
      .send({ institution: 'MIT', degree: 'BSc' });

    const jobTargetRes = await request(app.getHttpServer())
      .post('/api/v1/job-targets')
      .set(auth(accessToken))
      .send({
        title: 'Senior Backend Engineer',
        seniority: 'Senior',
        keywords: [{ keyword: 'Power BI' }, { keyword: 'Kubernetes' }],
        skills: [
          { skill: 'TypeScript', required: true },
          { skill: 'Docker', required: false },
        ],
        languages: [{ language: 'English' }],
      });
    const jobTargetId = jobTargetRes.body.data.id;

    const variantRes = await request(app.getHttpServer())
      .post('/api/v1/resume-variants')
      .set(auth(accessToken))
      .send({ title: 'Tailored for this role', jobTargetId });

    return { variantId: variantRes.body.data.id, jobTargetId };
  }

  async function startSession(accessToken: string, variantId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/interview/start')
      .set(auth(accessToken))
      .send({
        mode: 'RESUME',
        resumeVariantId: variantId,
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
      });
    return res.body.data.id;
  }

  /** FASE 11 — a bare Job Target, no Resume/Variant at all, for Mode JOB tests that must never require a CV. */
  async function setUpJobTargetOnly(accessToken: string): Promise<string> {
    const jobTargetRes = await request(app.getHttpServer())
      .post('/api/v1/job-targets')
      .set(auth(accessToken))
      .send({ title: 'Senior Backend Engineer', seniority: 'Senior' });
    return jobTargetRes.body.data.id;
  }

  async function startJobSession(
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/interview/start')
      .set(auth(accessToken))
      .send({ mode: 'JOB', type: 'MIXED', difficulty: 'SENIOR', language: 'en', ...body });
    return res.body.data.id;
  }

  async function startRoleSessionRes(accessToken: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/api/v1/interview/start')
      .set(auth(accessToken))
      .send({ mode: 'ROLE', type: 'MIXED', difficulty: 'SENIOR', language: 'en', ...body });
  }

  async function startRoleSession(
    accessToken: string,
    body: Record<string, unknown>,
  ): Promise<string> {
    const res = await startRoleSessionRes(accessToken, body);
    return res.body.data.id;
  }

  async function answerAllQuestions(
    accessToken: string,
    sessionId: string,
    questions: Array<{ id: string }>,
  ) {
    for (const q of questions) {
      await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId: q.id, answer: `My answer to ${q.id}.` });
    }
  }

  // ---------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------

  describe('POST /interview/start', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/interview/start').send({
        mode: 'RESUME',
        resumeVariantId: 'x',
        type: 'MIXED',
        difficulty: 'SENIOR',
        language: 'en',
      });
      expect(res.status).toBe(401);
    });

    it('rejects a variant with no linked job target', async () => {
      const { accessToken } = await registerAndLogin('no-job-target');
      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'R' });
      const variant = await request(app.getHttpServer())
        .post('/api/v1/resume-variants')
        .set(auth(accessToken))
        .send({ title: 'Untargeted' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(accessToken))
        .send({
          mode: 'RESUME',
          resumeVariantId: variant.body.data.id,
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        });
      expect(res.status).toBe(400);
    });

    it('creates a session in IN_PROGRESS status with no questions yet, charging nothing', async () => {
      const { userId, accessToken } = await registerAndLogin('start-happy');
      await grantCredits(userId, 200, 'start-happy');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(accessToken))
        .send({
          mode: 'RESUME',
          resumeVariantId: variantId,
          type: 'TECHNICAL',
          difficulty: 'MID',
          language: 'en',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.type).toBe('TECHNICAL');
      expect(res.body.data.difficulty).toBe('MID');
      expect(res.body.data.overallScore).toBeNull();

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(200); // start() never charges
    });

    it('rejects an optimizationId or coverLetterId belonging to another user', async () => {
      const userA = await registerAndLogin('cross-context-a');
      const userB = await registerAndLogin('cross-context-b');
      await grantCredits(userA.userId, 300, 'cross-context-a');
      const { variantId: variantA } = await setUpVariantWithLinkedJobTarget(userA.accessToken);
      const optimizationRun = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(userA.accessToken))
        .send({ resumeVariantId: variantA });

      const { variantId: variantB } = await setUpVariantWithLinkedJobTarget(userB.accessToken);
      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(userB.accessToken))
        .send({
          mode: 'RESUME',
          resumeVariantId: variantB,
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
          optimizationId: optimizationRun.body.data.id,
        });
      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Generate questions (Step 1)
  // ---------------------------------------------------------------------

  describe('POST /interview/:id/questions', () => {
    it('generates the default 6 questions via DummyAIProvider, charging credits exactly once', async () => {
      const { userId, accessToken } = await registerAndLogin('questions-default');
      await grantCredits(userId, 200, 'questions-default');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.questions).toHaveLength(6);
      for (const q of res.body.data.questions) {
        expect([
          'BEHAVIORAL',
          'TECHNICAL',
          'SITUATIONAL',
          'CULTURE',
          'LEADERSHIP',
          'COMMUNICATION',
        ]).toContain(q.category);
        expect(typeof q.question).toBe('string');
        expect(typeof q.idealAnswer).toBe('string');
        expect(q.answer).toBeNull();
      }

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(170); // 200 - 30

      const aiRequest = await prisma.aiRequest.findFirst({
        where: { userId, feature: QUESTIONS_FEATURE },
      });
      expect(aiRequest).toMatchObject({
        status: 'SUCCEEDED',
        provider: 'dummy',
        creditsCharged: 30,
      });
    });

    it('honors a custom questionCount', async () => {
      const { userId, accessToken } = await registerAndLogin('questions-custom-count');
      await grantCredits(userId, 200, 'questions-custom-count');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({ questionCount: 4 });

      expect(res.body.data.questions).toHaveLength(4);
    });

    it('rejects generating a second time for the same session ("Questions immutable")', async () => {
      const { userId, accessToken } = await registerAndLogin('questions-once');
      await grantCredits(userId, 200, 'questions-once');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);

      await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({});
      const second = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({});
      expect(second.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------
  // Invalid JSON + Credit refund (question generation)
  // ---------------------------------------------------------------------

  describe('Invalid JSON during question generation', () => {
    it('rejects with 422, refunds in full, and persists no questions', async () => {
      const { userId, accessToken } = await registerAndLogin('invalid-json-questions');
      await grantCredits(userId, 200, 'invalid-json-questions');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);

      providerRegistry.register(new BrokenJsonProvider());
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/interview/${sessionId}/questions`)
          .set(auth(accessToken))
          .send({});

        expect(res.status).toBe(422);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(200);

        const questions = await prisma.interviewQuestion.findMany({ where: { sessionId } });
        expect(questions).toHaveLength(0);

        const session = await prisma.interviewSession.findUnique({ where: { id: sessionId } });
        expect(session?.status).toBe('IN_PROGRESS');

        const transactions = await prisma.creditTransaction.findMany({
          where: { userId, type: { in: ['CONSUMPTION', 'REFUND'] } },
          orderBy: { createdAt: 'asc' },
        });
        expect(transactions.map((t) => t.type)).toEqual(['CONSUMPTION', 'REFUND']);
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    });
  });

  // ---------------------------------------------------------------------
  // Retry (question generation)
  // ---------------------------------------------------------------------

  describe('Retry during question generation', () => {
    it('retries a transient provider failure per the default retry policy and still completes successfully', async () => {
      const { userId, accessToken } = await registerAndLogin('retry-questions');
      await grantCredits(userId, 200, 'retry-questions');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);

      const flakyProvider = new FlakyThenValidProvider();
      providerRegistry.register(flakyProvider);
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/interview/${sessionId}/questions`)
          .set(auth(accessToken))
          .send({});

        expect(res.status).toBe(201);
        expect(res.body.data.questions).toHaveLength(6);
        expect(flakyProvider.callCount).toBe(3);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(170); // charged exactly once despite the retries
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    }, 15000);
  });

  // ---------------------------------------------------------------------
  // Answer (Step 2)
  // ---------------------------------------------------------------------

  describe('POST /interview/:id/answer', () => {
    it('submits an answer, allows editing it before evaluation, and rejects a foreign questionId', async () => {
      const { userId, accessToken } = await registerAndLogin('answer-flow');
      await grantCredits(userId, 200, 'answer-flow');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);
      const generated = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({});
      const questionId = generated.body.data.questions[0].id;

      const first = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId, answer: 'First draft answer.' });
      expect(first.status).toBe(201);
      expect(first.body.data.answer).toBe('First draft answer.');

      const edited = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId, answer: 'Edited, better answer.' });
      expect(edited.status).toBe(201);
      expect(edited.body.data.id).toBe(first.body.data.id); // same row, overwritten
      expect(edited.body.data.answer).toBe('Edited, better answer.');

      const answerCount = await prisma.interviewAnswer.count({ where: { questionId } });
      expect(answerCount).toBe(1); // never duplicated

      const foreignQuestion = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId: randomUUID(), answer: 'x' });
      expect(foreignQuestion.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Evaluate (Step 3)
  // ---------------------------------------------------------------------

  describe('POST /interview/:id/evaluate', () => {
    it('rejects evaluation when no questions exist, and when questions are unanswered', async () => {
      const { userId, accessToken } = await registerAndLogin('evaluate-guards');
      await grantCredits(userId, 200, 'evaluate-guards');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);

      const noQuestions = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/evaluate`)
        .set(auth(accessToken));
      expect(noQuestions.status).toBe(400);

      const generated = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({ questionCount: 3 });
      // Only answer 2 of the 3 questions.
      await answerAllQuestions(accessToken, sessionId, generated.body.data.questions.slice(0, 2));

      const partiallyAnswered = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/evaluate`)
        .set(auth(accessToken));
      expect(partiallyAnswered.status).toBe(400);
    });

    it('evaluates every answer, computes session scores, completes the session, and rejects a second evaluation', async () => {
      const { userId, accessToken } = await registerAndLogin('evaluate-happy');
      await grantCredits(userId, 200, 'evaluate-happy');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);
      const generated = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({ questionCount: 4 });
      await answerAllQuestions(accessToken, sessionId, generated.body.data.questions);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/evaluate`)
        .set(auth(accessToken));

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.completedAt).not.toBeNull();
      expect(typeof res.body.data.overallScore).toBe('number');
      expect(typeof res.body.data.technicalScore).toBe('number');
      expect(typeof res.body.data.communicationScore).toBe('number');
      expect(typeof res.body.data.confidenceScore).toBe('number');
      for (const q of res.body.data.questions) {
        expect(typeof q.answer.score).toBe('number');
        expect(typeof q.answer.feedback).toBe('string');
        expect(Array.isArray(q.answer.strengths)).toBe(true);
        expect(Array.isArray(q.answer.improvements)).toBe(true);
      }

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(140); // 200 - 30 (questions) - 30 (evaluation)

      // Cannot submit answers or re-evaluate after completion.
      const lateAnswer = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/answer`)
        .set(auth(accessToken))
        .send({ questionId: generated.body.data.questions[0].id, answer: 'too late' });
      expect(lateAnswer.status).toBe(400);

      const secondEvaluate = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/evaluate`)
        .set(auth(accessToken));
      expect(secondEvaluate.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------
  // Invalid JSON + Retry (evaluation)
  // ---------------------------------------------------------------------

  describe('Invalid JSON and Retry during evaluation', () => {
    it('invalid JSON: refunds in full, leaves the session IN_PROGRESS and answers unscored', async () => {
      const { userId, accessToken } = await registerAndLogin('invalid-json-eval');
      await grantCredits(userId, 200, 'invalid-json-eval');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);
      const generated = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({ questionCount: 3 });
      await answerAllQuestions(accessToken, sessionId, generated.body.data.questions);
      const balanceAfterQuestions = (await prisma.creditWallet.findUnique({ where: { userId } }))!
        .availableCredits;

      providerRegistry.register(new BrokenJsonProvider());
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/interview/${sessionId}/evaluate`)
          .set(auth(accessToken));
        expect(res.status).toBe(422);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(balanceAfterQuestions); // fully refunded

        const session = await prisma.interviewSession.findUnique({ where: { id: sessionId } });
        expect(session?.status).toBe('IN_PROGRESS');
        expect(session?.overallScore).toBeNull();

        const answers = await prisma.interviewAnswer.findMany({
          where: { question: { sessionId } },
        });
        expect(answers.every((a) => a.score === null)).toBe(true);
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    });

    it('retry: retries a transient failure per the default retry policy and still completes, charging once', async () => {
      const { userId, accessToken } = await registerAndLogin('retry-eval');
      await grantCredits(userId, 200, 'retry-eval');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);
      const generated = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({ questionCount: 3 });
      await answerAllQuestions(accessToken, sessionId, generated.body.data.questions);
      const balanceAfterQuestions = (await prisma.creditWallet.findUnique({ where: { userId } }))!
        .availableCredits;

      const flakyProvider = new FlakyThenValidProvider();
      providerRegistry.register(flakyProvider);
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/interview/${sessionId}/evaluate`)
          .set(auth(accessToken));

        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('COMPLETED');
        expect(flakyProvider.callCount).toBe(3);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(balanceAfterQuestions - 30);
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    }, 15000);
  });

  // ---------------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------------

  describe('DELETE /interview/:id', () => {
    it('soft-deletes: the row survives in Postgres with deletedAt set, but disappears from list/get', async () => {
      const { userId, accessToken } = await registerAndLogin('soft-delete');
      await grantCredits(userId, 200, 'soft-delete');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/interview/${sessionId}`)
        .set(auth(accessToken));
      expect(deleteRes.status).toBe(200);

      const getAfterDelete = await request(app.getHttpServer())
        .get(`/api/v1/interview/${sessionId}`)
        .set(auth(accessToken));
      expect(getAfterDelete.status).toBe(404);

      const stillInDb = await prisma.interviewSession.findUnique({ where: { id: sessionId } });
      expect(stillInDb).not.toBeNull();
      expect(stillInDb?.deletedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Ownership / Admin access
  // ---------------------------------------------------------------------

  describe('Ownership', () => {
    it("a user cannot start against, get, generate questions for, answer, evaluate, or delete another user's session", async () => {
      const userA = await registerAndLogin('ownership-a');
      const userB = await registerAndLogin('ownership-b');
      await grantCredits(userA.userId, 200, 'ownership-a');
      const { variantId } = await setUpVariantWithLinkedJobTarget(userA.accessToken);

      const crossStart = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(userB.accessToken))
        .send({
          mode: 'RESUME',
          resumeVariantId: variantId,
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        });
      expect(crossStart.status).toBe(404);

      const sessionId = await startSession(userA.accessToken, variantId);

      const crossGet = await request(app.getHttpServer())
        .get(`/api/v1/interview/${sessionId}`)
        .set(auth(userB.accessToken));
      expect(crossGet.status).toBe(404);

      const crossQuestions = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(userB.accessToken))
        .send({});
      expect(crossQuestions.status).toBe(404);

      const crossAnswer = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/answer`)
        .set(auth(userB.accessToken))
        .send({ questionId: randomUUID(), answer: 'x' });
      expect(crossAnswer.status).toBe(404);

      const crossEvaluate = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/evaluate`)
        .set(auth(userB.accessToken));
      expect(crossEvaluate.status).toBe(404);

      const crossDelete = await request(app.getHttpServer())
        .delete(`/api/v1/interview/${sessionId}`)
        .set(auth(userB.accessToken));
      expect(crossDelete.status).toBe(404);
    });
  });

  describe('Admin access', () => {
    it("an admin can read another user's interview sessions via the service-level bypass (self-service-only controllers, per the established Phase 2A+ pattern)", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAdmin('admin-actor');
      await grantCredits(owner.userId, 200, 'admin-target');
      const { variantId } = await setUpVariantWithLinkedJobTarget(owner.accessToken);
      const sessionId = await startSession(owner.accessToken, variantId);

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const list = await interviewService.list(adminRequestUser, owner.userId);
      expect(list.some((s) => s.id === sessionId)).toBe(true);

      const single = await interviewService.getOne(adminRequestUser, owner.userId, sessionId);
      expect(single.id).toBe(sessionId);
    });
  });

  // ---------------------------------------------------------------------
  // History events
  // ---------------------------------------------------------------------

  describe('History events', () => {
    it('records interview_started, question_generated, answer_submitted, evaluation_completed, and interview_deleted', async () => {
      const { userId, accessToken } = await registerAndLogin('history');
      await grantCredits(userId, 200, 'history');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);
      const sessionId = await startSession(accessToken, variantId);

      const generated = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({ questionCount: 3 });
      await answerAllQuestions(accessToken, sessionId, generated.body.data.questions);
      await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/evaluate`)
        .set(auth(accessToken));
      await request(app.getHttpServer())
        .delete(`/api/v1/interview/${sessionId}`)
        .set(auth(accessToken));

      const eventTypes = await waitForHistoryEventTypes(prisma, userId, [
        'interview_started',
        'question_generated',
        'answer_submitted',
        'evaluation_completed',
        'interview_deleted',
      ]);

      expect(eventTypes).toContain('interview_started');
      expect(eventTypes).toContain('question_generated');
      expect(eventTypes).toContain('answer_submitted');
      expect(eventTypes).toContain('evaluation_completed');
      expect(eventTypes).toContain('interview_deleted');
    });
  });

  // ---------------------------------------------------------------------
  // FASE 11 — Mode JOB: CV never required. jobTargetId and/or jobDescription.
  // ---------------------------------------------------------------------

  describe('Mode JOB', () => {
    it('starts with only a jobTargetId, no CV', async () => {
      const { accessToken } = await registerAndLogin('job-target-only');
      const jobTargetId = await setUpJobTargetOnly(accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(accessToken))
        .send({ mode: 'JOB', jobTargetId, type: 'MIXED', difficulty: 'SENIOR', language: 'en' });

      expect(res.status).toBe(201);
      expect(res.body.data.mode).toBe('JOB');
      expect(res.body.data.jobTargetId).toBe(jobTargetId);
      expect(res.body.data.resumeVariantId).toBeNull();
    });

    it('starts with only a jobDescription (pasted text), no CV, no existing Job Target', async () => {
      const { accessToken } = await registerAndLogin('job-description-only');

      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(accessToken))
        .send({
          mode: 'JOB',
          jobDescription: 'We are hiring a backend engineer with Node.js experience.',
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.mode).toBe('JOB');
      expect(res.body.data.jobTargetId).toBeNull();
      expect(res.body.data.jobDescription).toBe(
        'We are hiring a backend engineer with Node.js experience.',
      );
    });

    it('starts with both jobTargetId and jobDescription', async () => {
      const { accessToken } = await registerAndLogin('job-both');
      const jobTargetId = await setUpJobTargetOnly(accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(accessToken))
        .send({
          mode: 'JOB',
          jobTargetId,
          jobDescription: 'Additional context pasted by the user.',
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.jobTargetId).toBe(jobTargetId);
      expect(res.body.data.jobDescription).toBe('Additional context pasted by the user.');
    });

    it('accepts an optional resumeVariantId as extra context, without requiring one', async () => {
      const { accessToken } = await registerAndLogin('job-optional-cv');
      const { variantId, jobTargetId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(accessToken))
        .send({
          mode: 'JOB',
          jobTargetId,
          resumeVariantId: variantId,
          type: 'MIXED',
          difficulty: 'SENIOR',
          language: 'en',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.resumeVariantId).toBe(variantId);
    });

    it('rejects starting without a jobTargetId or jobDescription', async () => {
      const { accessToken } = await registerAndLogin('job-neither');

      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(accessToken))
        .send({ mode: 'JOB', type: 'MIXED', difficulty: 'SENIOR', language: 'en' });

      expect(res.status).toBe(400);
    });

    it('generates questions, charging exactly 25 credits, without requiring a CV', async () => {
      const { userId, accessToken } = await registerAndLogin('job-questions');
      await grantCredits(userId, 200, 'job-questions');
      const jobTargetId = await setUpJobTargetOnly(accessToken);
      const sessionId = await startJobSession(accessToken, { jobTargetId });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.questions).toHaveLength(6);

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(175); // 200 - 25

      const aiRequest = await prisma.aiRequest.findFirst({
        where: { userId, feature: QUESTIONS_JOB_FEATURE },
      });
      expect(aiRequest).toMatchObject({ status: 'SUCCEEDED', creditsCharged: 25 });
    });

    it('answers and evaluates a CV-less JOB session, charging 25 more credits (50 total), completing the session', async () => {
      const { userId, accessToken } = await registerAndLogin('job-full-flow');
      await grantCredits(userId, 200, 'job-full-flow');
      const jobTargetId = await setUpJobTargetOnly(accessToken);
      const sessionId = await startJobSession(accessToken, { jobTargetId });
      const generated = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({ questionCount: 3 });
      await answerAllQuestions(accessToken, sessionId, generated.body.data.questions);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/evaluate`)
        .set(auth(accessToken));

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(typeof res.body.data.overallScore).toBe('number');

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(150); // 200 - 25 (questions) - 25 (evaluation)

      const evalRequest = await prisma.aiRequest.findFirst({
        where: { userId, feature: EVALUATION_JOB_FEATURE },
      });
      expect(evalRequest).toMatchObject({ status: 'SUCCEEDED', creditsCharged: 25 });
    });

    it('invalid JSON during question generation: rejects with 422 and refunds the 25 credits in full', async () => {
      const { userId, accessToken } = await registerAndLogin('job-invalid-json');
      await grantCredits(userId, 200, 'job-invalid-json');
      const jobTargetId = await setUpJobTargetOnly(accessToken);
      const sessionId = await startJobSession(accessToken, { jobTargetId });

      providerRegistry.register(new BrokenJsonProvider());
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/interview/${sessionId}/questions`)
          .set(auth(accessToken))
          .send({});
        expect(res.status).toBe(422);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(200);

        const questions = await prisma.interviewQuestion.findMany({ where: { sessionId } });
        expect(questions).toHaveLength(0);
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    });

    it('retries a transient provider failure and still completes, charging 25 credits exactly once', async () => {
      const { userId, accessToken } = await registerAndLogin('job-retry');
      await grantCredits(userId, 200, 'job-retry');
      const jobTargetId = await setUpJobTargetOnly(accessToken);
      const sessionId = await startJobSession(accessToken, { jobTargetId });

      const flakyProvider = new FlakyThenValidProvider();
      providerRegistry.register(flakyProvider);
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/interview/${sessionId}/questions`)
          .set(auth(accessToken))
          .send({});

        expect(res.status).toBe(201);
        expect(flakyProvider.callCount).toBe(3);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(175); // charged exactly once despite retries
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    }, 15000);

    it('ownership: a stranger cannot generate questions, answer, evaluate, or delete a CV-less JOB session', async () => {
      const owner = await registerAndLogin('job-owner');
      const stranger = await registerAndLogin('job-stranger');
      await grantCredits(owner.userId, 200, 'job-owner');
      const jobTargetId = await setUpJobTargetOnly(owner.accessToken);
      const sessionId = await startJobSession(owner.accessToken, { jobTargetId });

      const crossQuestions = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(stranger.accessToken))
        .send({});
      expect(crossQuestions.status).toBe(404);

      const crossDelete = await request(app.getHttpServer())
        .delete(`/api/v1/interview/${sessionId}`)
        .set(auth(stranger.accessToken));
      expect(crossDelete.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // FASE 11 — Mode ROLE: no CV, no Job Target. Only what the user typed.
  // ---------------------------------------------------------------------

  describe('Mode ROLE', () => {
    it('starts with only a role', async () => {
      const { accessToken } = await registerAndLogin('role-only');

      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(accessToken))
        .send({
          mode: 'ROLE',
          role: 'Backend Developer',
          type: 'MIXED',
          difficulty: 'MID',
          language: 'pt-MZ',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.mode).toBe('ROLE');
      expect(res.body.data.role).toBe('Backend Developer');
      expect(res.body.data.resumeVariantId).toBeNull();
      expect(res.body.data.jobTargetId).toBeNull();
    });

    it('starts with role + industry', async () => {
      const { accessToken } = await registerAndLogin('role-industry');
      const res = await startRoleSessionRes(accessToken, {
        role: 'Backend Developer',
        industry: 'Fintech',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.industry).toBe('Fintech');
    });

    it('starts with role + yearsExperience', async () => {
      const { accessToken } = await registerAndLogin('role-years');
      const res = await startRoleSessionRes(accessToken, {
        role: 'Backend Developer',
        yearsExperience: 5,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.yearsExperience).toBe(5);
    });

    it('starts with role + companyName', async () => {
      const { accessToken } = await registerAndLogin('role-company');
      const res = await startRoleSessionRes(accessToken, {
        role: 'Backend Developer',
        companyName: 'Acme',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.companyName).toBe('Acme');
    });

    it('starts with every optional field', async () => {
      const { accessToken } = await registerAndLogin('role-all-fields');
      const res = await startRoleSessionRes(accessToken, {
        role: 'Backend Developer',
        industry: 'Fintech',
        yearsExperience: 5,
        companyName: 'Acme',
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        role: 'Backend Developer',
        industry: 'Fintech',
        yearsExperience: 5,
        companyName: 'Acme',
      });
    });

    it('rejects starting without a role', async () => {
      const { accessToken } = await registerAndLogin('role-missing');
      const res = await request(app.getHttpServer())
        .post('/api/v1/interview/start')
        .set(auth(accessToken))
        .send({ mode: 'ROLE', type: 'MIXED', difficulty: 'MID', language: 'pt-MZ' });
      expect(res.status).toBe(400);
    });

    it('generates questions, charging exactly 20 credits, with no CV and no Job Target', async () => {
      const { userId, accessToken } = await registerAndLogin('role-questions');
      await grantCredits(userId, 200, 'role-questions');
      const sessionId = await startRoleSession(accessToken, { role: 'Backend Developer' });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({});

      expect(res.status).toBe(201);
      expect(res.body.data.questions).toHaveLength(6);

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(180); // 200 - 20

      const aiRequest = await prisma.aiRequest.findFirst({
        where: { userId, feature: QUESTIONS_ROLE_FEATURE },
      });
      expect(aiRequest).toMatchObject({ status: 'SUCCEEDED', creditsCharged: 20 });
    });

    it('answers and evaluates a ROLE session, charging 20 more credits (40 total), completing the session', async () => {
      const { userId, accessToken } = await registerAndLogin('role-full-flow');
      await grantCredits(userId, 200, 'role-full-flow');
      const sessionId = await startRoleSession(accessToken, {
        role: 'Backend Developer',
        industry: 'Fintech',
      });
      const generated = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(accessToken))
        .send({ questionCount: 3 });
      await answerAllQuestions(accessToken, sessionId, generated.body.data.questions);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/evaluate`)
        .set(auth(accessToken));

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('COMPLETED');

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(160); // 200 - 20 (questions) - 20 (evaluation)

      const evalRequest = await prisma.aiRequest.findFirst({
        where: { userId, feature: EVALUATION_ROLE_FEATURE },
      });
      expect(evalRequest).toMatchObject({ status: 'SUCCEEDED', creditsCharged: 20 });
    });

    it('invalid JSON during question generation: rejects with 422 and refunds the 20 credits in full', async () => {
      const { userId, accessToken } = await registerAndLogin('role-invalid-json');
      await grantCredits(userId, 200, 'role-invalid-json');
      const sessionId = await startRoleSession(accessToken, { role: 'Backend Developer' });

      providerRegistry.register(new BrokenJsonProvider());
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/interview/${sessionId}/questions`)
          .set(auth(accessToken))
          .send({});
        expect(res.status).toBe(422);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(200);
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    });

    it('retries a transient provider failure and still completes, charging 20 credits exactly once', async () => {
      const { userId, accessToken } = await registerAndLogin('role-retry');
      await grantCredits(userId, 200, 'role-retry');
      const sessionId = await startRoleSession(accessToken, { role: 'Backend Developer' });

      const flakyProvider = new FlakyThenValidProvider();
      providerRegistry.register(flakyProvider);
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/interview/${sessionId}/questions`)
          .set(auth(accessToken))
          .send({});

        expect(res.status).toBe(201);
        expect(flakyProvider.callCount).toBe(3);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(180); // charged exactly once despite retries
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    }, 15000);

    it('ownership: a stranger cannot generate questions, answer, evaluate, or delete a ROLE session', async () => {
      const owner = await registerAndLogin('role-owner');
      const stranger = await registerAndLogin('role-stranger');
      await grantCredits(owner.userId, 200, 'role-owner');
      const sessionId = await startRoleSession(owner.accessToken, { role: 'Backend Developer' });

      const crossQuestions = await request(app.getHttpServer())
        .post(`/api/v1/interview/${sessionId}/questions`)
        .set(auth(stranger.accessToken))
        .send({});
      expect(crossQuestions.status).toBe(404);

      const crossDelete = await request(app.getHttpServer())
        .delete(`/api/v1/interview/${sessionId}`)
        .set(auth(stranger.accessToken));
      expect(crossDelete.status).toBe(404);
    });
  });
});
