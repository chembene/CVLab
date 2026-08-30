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
import { ResumeOptimizationService } from '../src/resume-optimization/resume-optimization.service';
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

const VALID_AI_JSON = JSON.stringify({
  summary: 'Optimize the summary and add missing skills.',
  predictedScore: 85,
  suggestions: [
    {
      type: 'SUMMARY',
      section: 'summary',
      priority: 'HIGH',
      title: 'Sharpen the summary',
      reason: 'The summary is too generic for this role.',
      originalText:
        'Experienced backend engineer who has shipped several Power BI dashboards for clients.',
      suggestedText:
        'Senior backend engineer specializing in Power BI dashboards and Kubernetes-based platforms.',
    },
    {
      type: 'SKILL',
      section: 'skills',
      priority: 'MEDIUM',
      title: 'Add Kubernetes',
      reason: 'Kubernetes is required by the job target and missing from the resume.',
      originalText: '',
      suggestedText: 'Kubernetes',
    },
  ],
});

/**
 * Covers the Phase 7 AI Resume Optimization Engine end-to-end against the
 * real Postgres/Redis from docker-compose.yml: the full Resume Variant → ATS
 * Report → AI Orchestration → Prompt Builder → DummyAIProvider → Suggestions
 * → Apply → new ATS Report flow, over real HTTP. A handful of tests
 * temporarily re-register a broken/flaky test double under the registry key
 * "dummy" (restored to the real DummyAIProvider immediately after) to prove
 * the invalid-JSON, credit-refund, and retry paths without needing
 * DummyAIProvider itself to ever misbehave — the same technique
 * ai-orchestration.e2e-spec.ts uses for its own failure-path tests.
 */
describe('Resume Optimization Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let providerRegistry: ProviderRegistry;
  let resumeOptimizationService: ResumeOptimizationService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `resume-opt-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  const FEATURE_KEY = AIFeature.RESUME_OPTIMIZATION;

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

  class ValidJsonProvider implements AIProvider {
    readonly name = 'dummy';
    async generate(_request: GenerateRequest): Promise<GenerateResult> {
      return {
        text: VALID_AI_JSON,
        provider: this.name,
        model: 'dummy-v1',
        tokenUsage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        finishReason: 'stop',
        requestId: `valid-${randomUUID()}`,
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
    async generate(_request: GenerateRequest): Promise<GenerateResult> {
      this.callCount += 1;
      if (this.callCount < 3) {
        throw new ProviderUnavailableError('dummy');
      }
      return {
        text: VALID_AI_JSON,
        provider: this.name,
        model: 'dummy-v1',
        tokenUsage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        finishReason: 'stop',
        requestId: `flaky-${randomUUID()}`,
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

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    creditService = moduleRef.get(CreditService);
    providerRegistry = moduleRef.get(ProviderRegistry);
    resumeOptimizationService = moduleRef.get(ResumeOptimizationService);

    await prisma.featurePricing.create({
      data: { featureKey: FEATURE_KEY, cost: 80, active: true },
    });
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `resume-opt-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
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
        // their ResumeVariant. Neither relation cascades on delete.
        await prisma.application.deleteMany({ where: { userId: { in: userIds } } });
        if (variantIds.length > 0) {
          await prisma.resumeVariantVersion.deleteMany({
            where: { resumeVariantId: { in: variantIds } },
          });
        }
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
      await prisma.featurePricing.deleteMany({ where: { featureKey: FEATURE_KEY } });
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

  /** Self-grant pattern: audit_logs.actor_id has a real FK to users.id, so the target user is used as its own "admin" actor — see credit-engine.e2e-spec.ts for the original rationale. */
  async function grantCredits(userId: string, amount: number, label: string): Promise<void> {
    await creditService.adjustBalance(userId, {
      userId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
      reason: 'Test fixture setup',
      idempotencyKey: `${label}-grant-${randomUUID()}`,
    });
  }

  /** Master Resume + skills/languages/experience/education + a Job Target with known keywords/skills + a linked Resume Variant — the fixture every optimization test builds on. */
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

  // ---------------------------------------------------------------------
  // Run
  // ---------------------------------------------------------------------

  describe('POST /resume-optimization/run', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .send({ resumeVariantId: 'x' });
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
        .post('/api/v1/resume-optimization/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variant.body.data.id });
      expect(res.status).toBe(400);
    });

    it('runs the full pipeline: ATS baseline → AI Orchestration → DummyAIProvider → parsed suggestions, charging credits exactly once', async () => {
      const { userId, accessToken } = await registerAndLogin('happy-path');
      await grantCredits(userId, 200, 'happy-path');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });

      expect(res.status).toBe(201);
      const optimization = res.body.data;
      expect(optimization.status).toBe('COMPLETED');
      expect(optimization.creditsUsed).toBe(80);
      expect(optimization.beforeScore).toBeGreaterThanOrEqual(0);
      expect(typeof optimization.predictedScore).toBe('number');
      expect(typeof optimization.summary).toBe('string');
      expect(Array.isArray(optimization.suggestions)).toBe(true);
      expect(optimization.suggestions.length).toBeGreaterThan(0);
      expect(optimization.suggestions[0]).toMatchObject({
        accepted: false,
        applied: false,
        displayOrder: 0,
      });

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(120); // 200 - 80

      const aiRequest = await prisma.aiRequest.findFirst({
        where: { userId, feature: FEATURE_KEY },
      });
      expect(aiRequest).toMatchObject({
        status: 'SUCCEEDED',
        provider: 'dummy',
        creditsCharged: 80,
      });
    });

    it('reuses the most recent existing ATS report as the "before" baseline unless force is set', async () => {
      const { userId, accessToken } = await registerAndLogin('reuse-baseline');
      await grantCredits(userId, 200, 'reuse-baseline');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const firstAts = await request(app.getHttpServer())
        .post('/api/v1/ats/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });

      const run = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });

      expect(run.body.data.beforeScore).toBe(firstAts.body.data.overallScore);
      const reportsAfterRun = await request(app.getHttpServer())
        .get('/api/v1/ats/reports')
        .set(auth(accessToken));
      expect(reportsAfterRun.body.data).toHaveLength(1); // no extra ATS report created just to run the optimization

      const forcedRun = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, force: true });
      expect(forcedRun.status).toBe(201);
      const reportsAfterForce = await request(app.getHttpServer())
        .get('/api/v1/ats/reports')
        .set(auth(accessToken));
      expect(reportsAfterForce.body.data).toHaveLength(2); // force always runs a fresh one
    });
  });

  // ---------------------------------------------------------------------
  // Invalid JSON + Credit refund
  // ---------------------------------------------------------------------

  describe('Invalid JSON from the AI provider', () => {
    it('fails the optimization, refunds the charge in full, and records a FAILED row', async () => {
      const { userId, accessToken } = await registerAndLogin('invalid-json');
      await grantCredits(userId, 200, 'invalid-json');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      providerRegistry.register(new BrokenJsonProvider());
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/resume-optimization/run')
          .set(auth(accessToken))
          .send({ resumeVariantId: variantId });

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(200); // fully refunded, net zero

        const failedOptimization = await prisma.resumeOptimization.findFirst({ where: { userId } });
        expect(failedOptimization?.status).toBe('FAILED');

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
  // Retry
  // ---------------------------------------------------------------------

  describe('Retry', () => {
    it('retries a transient provider failure per the default retry policy and still completes successfully', async () => {
      const { userId, accessToken } = await registerAndLogin('retry');
      await grantCredits(userId, 200, 'retry');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const flakyProvider = new FlakyThenValidProvider();
      providerRegistry.register(flakyProvider);
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/resume-optimization/run')
          .set(auth(accessToken))
          .send({ resumeVariantId: variantId });

        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('COMPLETED');
        expect(flakyProvider.callCount).toBe(3); // 2 failures + 1 success, within DEFAULT_RETRY_POLICY.maxAttempts

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(120); // charged exactly once despite the retries
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    }, 15000);
  });

  // ---------------------------------------------------------------------
  // Apply
  // ---------------------------------------------------------------------

  describe('POST /resume-optimization/:id/apply', () => {
    it('applies only the accepted suggestions, updates the resume variant content, and re-runs ATS for a new score', async () => {
      const { userId, accessToken } = await registerAndLogin('apply');
      await grantCredits(userId, 200, 'apply');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      providerRegistry.register(new ValidJsonProvider());
      try {
        const run = await request(app.getHttpServer())
          .post('/api/v1/resume-optimization/run')
          .set(auth(accessToken))
          .send({ resumeVariantId: variantId });
        const optimizationId = run.body.data.id;
        const suggestionIds = run.body.data.suggestions.map((s: { id: string }) => s.id);

        const reportsBeforeApply = await request(app.getHttpServer())
          .get('/api/v1/ats/reports')
          .set(auth(accessToken));
        const reportCountBeforeApply = reportsBeforeApply.body.data.length;

        const applyRes = await request(app.getHttpServer())
          .post(`/api/v1/resume-optimization/${optimizationId}/apply`)
          .set(auth(accessToken))
          .send({ suggestionIds });

        expect(applyRes.status).toBe(201);
        expect(applyRes.body.data.appliedSuggestionIds.sort()).toEqual([...suggestionIds].sort());
        expect(applyRes.body.data.newAtsReport).toBeDefined();
        expect(
          applyRes.body.data.optimization.suggestions.every((s: { applied: boolean }) => s.applied),
        ).toBe(true);

        const variant = await prisma.resumeVariant.findUnique({ where: { id: variantId } });
        const content = variant?.content as Record<string, unknown>;
        expect(content.summary).toBe(
          'Senior backend engineer specializing in Power BI dashboards and Kubernetes-based platforms.',
        );
        expect(content.skills).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: 'Kubernetes' })]),
        );

        const reportsAfterApply = await request(app.getHttpServer())
          .get('/api/v1/ats/reports')
          .set(auth(accessToken));
        expect(reportsAfterApply.body.data.length).toBe(reportCountBeforeApply + 1);

        // Applying the same suggestions again is a no-op error, not a silent re-apply.
        const reapply = await request(app.getHttpServer())
          .post(`/api/v1/resume-optimization/${optimizationId}/apply`)
          .set(auth(accessToken))
          .send({ suggestionIds });
        expect(reapply.status).toBe(400);
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    });
  });

  // ---------------------------------------------------------------------
  // Ownership / Admin access
  // ---------------------------------------------------------------------

  describe('Ownership', () => {
    it("a user cannot run against, get, apply to, or delete another user's resume variant/optimization", async () => {
      const userA = await registerAndLogin('ownership-a');
      const userB = await registerAndLogin('ownership-b');
      await grantCredits(userA.userId, 200, 'ownership-a');
      const { variantId } = await setUpVariantWithLinkedJobTarget(userA.accessToken);

      const crossRun = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(userB.accessToken))
        .send({ resumeVariantId: variantId });
      expect(crossRun.status).toBe(404);

      const ownRun = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(userA.accessToken))
        .send({ resumeVariantId: variantId });
      const optimizationId = ownRun.body.data.id;

      const crossGet = await request(app.getHttpServer())
        .get(`/api/v1/resume-optimization/${optimizationId}`)
        .set(auth(userB.accessToken));
      expect(crossGet.status).toBe(404);

      const crossApply = await request(app.getHttpServer())
        .post(`/api/v1/resume-optimization/${optimizationId}/apply`)
        .set(auth(userB.accessToken))
        .send({ suggestionIds: [ownRun.body.data.suggestions[0].id] });
      expect(crossApply.status).toBe(404);

      const crossDelete = await request(app.getHttpServer())
        .delete(`/api/v1/resume-optimization/${optimizationId}`)
        .set(auth(userB.accessToken));
      expect(crossDelete.status).toBe(404);
    });
  });

  describe('Admin access', () => {
    it("an admin can read another user's optimizations via the service-level bypass (self-service-only controllers, per the established Phase 2A+ pattern)", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAdmin('admin-actor');
      await grantCredits(owner.userId, 200, 'admin-target');
      const { variantId } = await setUpVariantWithLinkedJobTarget(owner.accessToken);

      const run = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(owner.accessToken))
        .send({ resumeVariantId: variantId });

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const list = await resumeOptimizationService.list(adminRequestUser, owner.userId);
      expect(list.some((o) => o.id === run.body.data.id)).toBe(true);

      const single = await resumeOptimizationService.getOne(
        adminRequestUser,
        owner.userId,
        run.body.data.id,
      );
      expect(single.id).toBe(run.body.data.id);
    });
  });

  // ---------------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------------

  describe('DELETE /resume-optimization/:id', () => {
    it('soft-deletes: the row survives in Postgres with deletedAt set, but disappears from list/get', async () => {
      const { userId, accessToken } = await registerAndLogin('soft-delete');
      await grantCredits(userId, 200, 'soft-delete');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const run = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });
      const id = run.body.data.id;

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/resume-optimization/${id}`)
        .set(auth(accessToken));
      expect(deleteRes.status).toBe(200);

      const getAfterDelete = await request(app.getHttpServer())
        .get(`/api/v1/resume-optimization/${id}`)
        .set(auth(accessToken));
      expect(getAfterDelete.status).toBe(404);

      const list = await request(app.getHttpServer())
        .get('/api/v1/resume-optimization')
        .set(auth(accessToken));
      expect(list.body.data.find((o: { id: string }) => o.id === id)).toBeUndefined();

      const stillInDb = await prisma.resumeOptimization.findUnique({ where: { id } });
      expect(stillInDb).not.toBeNull();
      expect(stillInDb?.deletedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // History events
  // ---------------------------------------------------------------------

  describe('History events', () => {
    it('records optimization_started, optimization_completed, suggestion_applied, and optimization_deleted', async () => {
      const { userId, accessToken } = await registerAndLogin('history');
      await grantCredits(userId, 200, 'history');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const run = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });
      const optimizationId = run.body.data.id;
      const suggestionIds = run.body.data.suggestions.map((s: { id: string }) => s.id);

      await request(app.getHttpServer())
        .post(`/api/v1/resume-optimization/${optimizationId}/apply`)
        .set(auth(accessToken))
        .send({ suggestionIds });

      await request(app.getHttpServer())
        .delete(`/api/v1/resume-optimization/${optimizationId}`)
        .set(auth(accessToken));

      const eventTypes = await waitForHistoryEventTypes(prisma, userId, [
        'optimization_started',
        'optimization_completed',
        'suggestion_applied',
        'optimization_deleted',
      ]);

      expect(eventTypes).toContain('optimization_started');
      expect(eventTypes).toContain('optimization_completed');
      expect(eventTypes).toContain('suggestion_applied');
      expect(eventTypes).toContain('optimization_deleted');
    });

    it('records optimization_failed when the AI response is malformed', async () => {
      const { userId, accessToken } = await registerAndLogin('history-failed');
      await grantCredits(userId, 200, 'history-failed');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      providerRegistry.register(new BrokenJsonProvider());
      try {
        await request(app.getHttpServer())
          .post('/api/v1/resume-optimization/run')
          .set(auth(accessToken))
          .send({ resumeVariantId: variantId });

        const eventTypes = await waitForHistoryEventTypes(prisma, userId, ['optimization_failed']);
        expect(eventTypes).toContain('optimization_failed');
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    });
  });
});
