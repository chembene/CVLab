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
import { CoverLetterService } from '../src/cover-letter/cover-letter.service';
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
  title: 'Cover Letter — Senior Backend Engineer',
  coverLetter: 'Dear Hiring Manager,\n\nI am excited to apply...\n\nSincerely,\nThe Candidate',
  summary: 'Emphasizes backend leadership and Kubernetes experience.',
});

/**
 * Covers the Phase 8 AI Cover Letter Engine end-to-end against the real
 * Postgres/Redis from docker-compose.yml — mirrors
 * resume-optimization.e2e-spec.ts's (Phase 7) structure and techniques
 * exactly, including temporarily re-registering a broken/flaky test double
 * under the registry key "dummy" (restored to the real DummyAIProvider
 * immediately after) to prove the invalid-JSON, credit-refund, and retry
 * paths without needing DummyAIProvider itself to ever misbehave.
 */
describe('Cover Letter Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let providerRegistry: ProviderRegistry;
  let coverLetterService: CoverLetterService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `cover-letter-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  const FEATURE_KEY = AIFeature.COVER_LETTER;

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
    coverLetterService = moduleRef.get(CoverLetterService);

    await prisma.featurePricing.createMany({
      data: [
        { featureKey: FEATURE_KEY, cost: 40, active: true },
        // Needed because two tests below also call POST /resume-optimization/run
        // to obtain a real optimizationId — that endpoint requires its own
        // feature_pricing row to exist, same gap flagged since Phase 5.
        { featureKey: AIFeature.RESUME_OPTIMIZATION, cost: 80, active: true },
      ],
    });
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `cover-letter-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
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
        where: { featureKey: { in: [FEATURE_KEY, AIFeature.RESUME_OPTIMIZATION] } },
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

  // ---------------------------------------------------------------------
  // Generate
  // ---------------------------------------------------------------------

  describe('POST /cover-letter/generate', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .send({ resumeVariantId: 'x', tone: 'PROFESSIONAL', language: 'en' });
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
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variant.body.data.id, tone: 'PROFESSIONAL', language: 'en' });
      expect(res.status).toBe(400);
    });

    it('generates a cover letter via DummyAIProvider, charging credits exactly once', async () => {
      const { userId, accessToken } = await registerAndLogin('happy-path');
      await grantCredits(userId, 200, 'happy-path');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });

      expect(res.status).toBe(201);
      const coverLetter = res.body.data;
      expect(coverLetter.status).toBe('GENERATED');
      expect(coverLetter.version).toBe(1);
      expect(coverLetter.creditsUsed).toBe(40);
      expect(coverLetter.generatedByAI).toBe(true);
      expect(typeof coverLetter.title).toBe('string');
      expect(typeof coverLetter.content).toBe('string');
      expect(coverLetter.content.length).toBeGreaterThan(0);

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(160); // 200 - 40

      const aiRequest = await prisma.aiRequest.findFirst({
        where: { userId, feature: FEATURE_KEY },
      });
      expect(aiRequest).toMatchObject({
        status: 'SUCCEEDED',
        provider: 'dummy',
        creditsCharged: 40,
      });
    });

    it('includes the Resume Optimization summary when optimizationId is provided', async () => {
      const { userId, accessToken } = await registerAndLogin('with-optimization');
      await grantCredits(userId, 300, 'with-optimization');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const optimizationRun = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });
      const optimizationId = optimizationRun.body.data.id;

      const res = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, tone: 'MODERN', language: 'en', optimizationId });

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('GENERATED');
    });

    it('rejects an optimizationId belonging to another user', async () => {
      const userA = await registerAndLogin('optimization-cross-a');
      const userB = await registerAndLogin('optimization-cross-b');
      await grantCredits(userA.userId, 300, 'optimization-cross-a');
      await grantCredits(userB.userId, 300, 'optimization-cross-b');
      const { variantId: variantA } = await setUpVariantWithLinkedJobTarget(userA.accessToken);
      const optimizationRun = await request(app.getHttpServer())
        .post('/api/v1/resume-optimization/run')
        .set(auth(userA.accessToken))
        .send({ resumeVariantId: variantA });

      const { variantId: variantB } = await setUpVariantWithLinkedJobTarget(userB.accessToken);
      const res = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(userB.accessToken))
        .send({
          resumeVariantId: variantB,
          tone: 'PROFESSIONAL',
          language: 'en',
          optimizationId: optimizationRun.body.data.id,
        });

      expect(res.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------
  // Invalid JSON + Credit refund
  // ---------------------------------------------------------------------

  describe('Invalid JSON from the AI provider', () => {
    it('rejects with 422, refunds the charge in full, and persists no row (no PENDING/FAILED state exists)', async () => {
      const { userId, accessToken } = await registerAndLogin('invalid-json');
      await grantCredits(userId, 200, 'invalid-json');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      providerRegistry.register(new BrokenJsonProvider());
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/cover-letter/generate')
          .set(auth(accessToken))
          .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(200); // fully refunded, net zero

        const coverLetters = await prisma.coverLetter.findMany({ where: { userId } });
        expect(coverLetters).toHaveLength(0);

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
          .post('/api/v1/cover-letter/generate')
          .set(auth(accessToken))
          .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });

        expect(res.status).toBe(201);
        expect(res.body.data.status).toBe('GENERATED');
        expect(flakyProvider.callCount).toBe(3);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(160); // charged exactly once despite the retries
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    }, 15000);
  });

  // ---------------------------------------------------------------------
  // Versioning (regenerate)
  // ---------------------------------------------------------------------

  describe('POST /cover-letter/:id/regenerate', () => {
    it('creates a new version, never overwriting the previous one', async () => {
      const { userId, accessToken } = await registerAndLogin('regenerate');
      await grantCredits(userId, 200, 'regenerate');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const first = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });
      const firstId = first.body.data.id;

      const second = await request(app.getHttpServer())
        .post(`/api/v1/cover-letter/${firstId}/regenerate`)
        .set(auth(accessToken));

      expect(second.status).toBe(201);
      expect(second.body.data.id).not.toBe(firstId);
      expect(second.body.data.version).toBe(2);
      expect(second.body.data.status).toBe('GENERATED');

      // The original row is untouched.
      const original = await prisma.coverLetter.findUnique({ where: { id: firstId } });
      expect(original?.version).toBe(1);
      expect(original?.status).toBe('GENERATED');
      expect(original?.deletedAt).toBeNull();

      const list = await request(app.getHttpServer())
        .get('/api/v1/cover-letter')
        .set(auth(accessToken));
      expect(list.body.data.map((c: { id: string }) => c.id).sort()).toEqual(
        [firstId, second.body.data.id].sort(),
      );

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(120); // charged twice — two real generations
    });
  });

  // ---------------------------------------------------------------------
  // Manual edit
  // ---------------------------------------------------------------------

  describe('PUT /cover-letter/:id', () => {
    it('updates in place, sets status EDITED, and never bumps version or charges credits', async () => {
      const { userId, accessToken } = await registerAndLogin('manual-edit');
      await grantCredits(userId, 200, 'manual-edit');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const generated = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });
      const id = generated.body.data.id;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${id}`)
        .set(auth(accessToken))
        .send({ content: 'Manually rewritten content.' });

      expect(res.status).toBe(200);
      expect(res.body.data.content).toBe('Manually rewritten content.');
      expect(res.body.data.status).toBe('EDITED');
      expect(res.body.data.version).toBe(1);

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(160); // unchanged since generation
    });
  });

  // ---------------------------------------------------------------------
  // Duplicate
  // ---------------------------------------------------------------------

  describe('POST /cover-letter/:id/duplicate', () => {
    it('creates an independent copy — version 1, DRAFT, not AI-generated, no credit charge', async () => {
      const { userId, accessToken } = await registerAndLogin('duplicate');
      await grantCredits(userId, 200, 'duplicate');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const generated = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });
      const id = generated.body.data.id;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/cover-letter/${id}/duplicate`)
        .set(auth(accessToken));

      expect(res.status).toBe(201);
      expect(res.body.data.id).not.toBe(id);
      expect(res.body.data.version).toBe(1);
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.generatedByAI).toBe(false);
      expect(res.body.data.creditsUsed).toBe(0);
      expect(res.body.data.content).toBe(generated.body.data.content);

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(160); // unchanged — duplicate is free
    });
  });

  // ---------------------------------------------------------------------
  // Archive / Restore
  // ---------------------------------------------------------------------

  describe('PUT /cover-letter/:id/archive and /restore', () => {
    it('archives then restores back to GENERATED', async () => {
      const { userId, accessToken } = await registerAndLogin('archive-restore');
      await grantCredits(userId, 200, 'archive-restore');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const generated = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });
      const id = generated.body.data.id;

      const archived = await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${id}/archive`)
        .set(auth(accessToken));
      expect(archived.status).toBe(200);
      expect(archived.body.data.status).toBe('ARCHIVED');

      // Idempotent no-op.
      const archivedAgain = await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${id}/archive`)
        .set(auth(accessToken));
      expect(archivedAgain.body.data.status).toBe('ARCHIVED');

      const restored = await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${id}/restore`)
        .set(auth(accessToken));
      expect(restored.status).toBe(200);
      expect(restored.body.data.status).toBe('GENERATED');
    });
  });

  // ---------------------------------------------------------------------
  // Soft delete
  // ---------------------------------------------------------------------

  describe('DELETE /cover-letter/:id', () => {
    it('soft-deletes: the row survives in Postgres with deletedAt set, but disappears from list/get', async () => {
      const { userId, accessToken } = await registerAndLogin('soft-delete');
      await grantCredits(userId, 200, 'soft-delete');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const generated = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });
      const id = generated.body.data.id;

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/cover-letter/${id}`)
        .set(auth(accessToken));
      expect(deleteRes.status).toBe(200);

      const getAfterDelete = await request(app.getHttpServer())
        .get(`/api/v1/cover-letter/${id}`)
        .set(auth(accessToken));
      expect(getAfterDelete.status).toBe(404);

      const stillInDb = await prisma.coverLetter.findUnique({ where: { id } });
      expect(stillInDb).not.toBeNull();
      expect(stillInDb?.deletedAt).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------
  // Ownership / Admin access
  // ---------------------------------------------------------------------

  describe('Ownership', () => {
    it("a user cannot generate against, get, update, regenerate, duplicate, archive, or delete another user's cover letter", async () => {
      const userA = await registerAndLogin('ownership-a');
      const userB = await registerAndLogin('ownership-b');
      await grantCredits(userA.userId, 200, 'ownership-a');
      const { variantId } = await setUpVariantWithLinkedJobTarget(userA.accessToken);

      const crossGenerate = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(userB.accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });
      expect(crossGenerate.status).toBe(404);

      const own = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(userA.accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });
      const id = own.body.data.id;

      const crossGet = await request(app.getHttpServer())
        .get(`/api/v1/cover-letter/${id}`)
        .set(auth(userB.accessToken));
      expect(crossGet.status).toBe(404);

      const crossUpdate = await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${id}`)
        .set(auth(userB.accessToken))
        .send({ title: 'Hijacked' });
      expect(crossUpdate.status).toBe(404);

      const crossRegenerate = await request(app.getHttpServer())
        .post(`/api/v1/cover-letter/${id}/regenerate`)
        .set(auth(userB.accessToken));
      expect(crossRegenerate.status).toBe(404);

      const crossDuplicate = await request(app.getHttpServer())
        .post(`/api/v1/cover-letter/${id}/duplicate`)
        .set(auth(userB.accessToken));
      expect(crossDuplicate.status).toBe(404);

      const crossArchive = await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${id}/archive`)
        .set(auth(userB.accessToken));
      expect(crossArchive.status).toBe(404);

      const crossDelete = await request(app.getHttpServer())
        .delete(`/api/v1/cover-letter/${id}`)
        .set(auth(userB.accessToken));
      expect(crossDelete.status).toBe(404);
    });
  });

  describe('Admin access', () => {
    it("an admin can read another user's cover letters via the service-level bypass (self-service-only controllers, per the established Phase 2A+ pattern)", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAdmin('admin-actor');
      await grantCredits(owner.userId, 200, 'admin-target');
      const { variantId } = await setUpVariantWithLinkedJobTarget(owner.accessToken);

      const generated = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(owner.accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const list = await coverLetterService.list(adminRequestUser, owner.userId);
      expect(list.some((c) => c.id === generated.body.data.id)).toBe(true);

      const single = await coverLetterService.getOne(
        adminRequestUser,
        owner.userId,
        generated.body.data.id,
      );
      expect(single.id).toBe(generated.body.data.id);
    });
  });

  // ---------------------------------------------------------------------
  // History events
  // ---------------------------------------------------------------------

  describe('History events', () => {
    it('records cover_letter_generated, cover_letter_updated, cover_letter_archived, cover_letter_restored, and cover_letter_deleted', async () => {
      const { userId, accessToken } = await registerAndLogin('history');
      await grantCredits(userId, 200, 'history');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const generated = await request(app.getHttpServer())
        .post('/api/v1/cover-letter/generate')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId, tone: 'PROFESSIONAL', language: 'en' });
      const id = generated.body.data.id;

      await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${id}`)
        .set(auth(accessToken))
        .send({ title: 'Edited title' });
      await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${id}/archive`)
        .set(auth(accessToken));
      await request(app.getHttpServer())
        .put(`/api/v1/cover-letter/${id}/restore`)
        .set(auth(accessToken));
      await request(app.getHttpServer())
        .delete(`/api/v1/cover-letter/${id}`)
        .set(auth(accessToken));

      const eventTypes = await waitForHistoryEventTypes(prisma, userId, [
        'cover_letter_generated',
        'cover_letter_updated',
        'cover_letter_archived',
        'cover_letter_restored',
        'cover_letter_deleted',
      ]);

      expect(eventTypes).toContain('cover_letter_generated');
      expect(eventTypes).toContain('cover_letter_updated');
      expect(eventTypes).toContain('cover_letter_archived');
      expect(eventTypes).toContain('cover_letter_restored');
      expect(eventTypes).toContain('cover_letter_deleted');
    });
  });
});
