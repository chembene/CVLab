import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreditService } from '../src/credits/credit.service';
import { AiOrchestrationService } from '../src/ai-orchestration/pipeline/ai-orchestration.service';
import { ProviderRegistry } from '../src/ai-orchestration/providers/provider-registry';
import { DummyAIProvider } from '../src/ai-orchestration/providers/dummy-ai-provider';
import { AIFeature } from '../src/ai-orchestration/constants/ai-feature.enum';
import { TemplateRecommendationService } from '../src/template-recommendation/template-recommendation.service';
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

/**
 * Covers FASE 21's Template Recommendation Engine end-to-end against the
 * real Postgres/Redis from docker-compose.yml — mirrors
 * career-advisor.e2e-spec.ts's (FASE 18)/linkedin.e2e-spec.ts's (FASE 19)/
 * ats-ai.e2e-spec.ts's (FASE 20) structure exactly. Relies on the
 * already-seeded `resume_templates` catalog (`prisma/seed-templates.ts`,
 * Phase 11) — never seeds template rows itself, proving this feature
 * genuinely reads the real Template Engine catalog rather than a stand-in.
 * Per FASE 21's brief: does NOT duplicate scenarios already covered
 * generically by ai-orchestration.e2e-spec.ts (retry policy, generic
 * refund-on-Build-Prompt-failure, generic idempotency mechanics) except
 * where this feature's own integration specifically needs proving.
 */
describe('Template Recommendation Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let orchestrationService: AiOrchestrationService;
  let providerRegistry: ProviderRegistry;
  let templateRecommendationService: TemplateRecommendationService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `template-rec-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  const FEATURE_KEY = AIFeature.TEMPLATE_RECOMMENDATION;
  const COST = 20;

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

  /** Structurally-valid JSON, but every templateId is fabricated — proves the "AI names a nonexistent template" path is handled safely and deterministically (dropped, then refunded when nothing survives), never persisted. */
  class FakeTemplateIdProvider implements AIProvider {
    readonly name = 'dummy';
    async generate(_request: GenerateRequest): Promise<GenerateResult> {
      const text = JSON.stringify({
        summary: 'Fabricated recommendations.',
        templateRecommendations: [
          {
            templateId: `not-a-real-template-${randomUUID()}`,
            rank: 1,
            score: 90,
            reason: 'Fabricated.',
          },
        ],
      });
      return {
        text,
        provider: this.name,
        model: 'dummy-v1',
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
        requestId: `fake-ids-${randomUUID()}`,
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
    orchestrationService = moduleRef.get(AiOrchestrationService);
    providerRegistry = moduleRef.get(ProviderRegistry);
    templateRecommendationService = moduleRef.get(TemplateRecommendationService);

    // Scoped to this file only, created and torn down here — feature_pricing
    // has no general seed mechanism yet (a known, documented gap; see
    // seed-templates.ts's own doc comment), so every e2e spec manages its
    // own temporary row, same as career-advisor.e2e-spec.ts's/
    // linkedin.e2e-spec.ts's/ats-ai.e2e-spec.ts's precedent.
    await prisma.featurePricing.createMany({
      data: [{ featureKey: FEATURE_KEY, cost: COST, active: true }],
    });
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `template-rec-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        await prisma.templateRecommendation.deleteMany({ where: { userId: { in: userIds } } });

        const resumes = await prisma.masterResume.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const resumeIds = resumes.map((r) => r.id);
        if (resumeIds.length > 0) {
          await prisma.$transaction([
            prisma.workExperience.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.education.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.skill.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.language.deleteMany({ where: { resumeId: { in: resumeIds } } }),
          ]);
        }

        const variants = await prisma.resumeVariant.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const variantIds = variants.map((v) => v.id);
        if (variantIds.length > 0) {
          await prisma.resumeVariantVersion.deleteMany({
            where: { resumeVariantId: { in: variantIds } },
          });
        }

        await prisma.$transaction([
          prisma.resumeVariant.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.masterResume.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.profile.deleteMany({ where: { userId: { in: userIds } } }),
        ]);

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
    await request(app.getHttpServer())
      .post('/api/v1/resume')
      .set(auth(accessToken))
      .send({ title: 'My Resume', summary: 'Experienced backend engineer.', yearsExperience: 5 });
    await request(app.getHttpServer())
      .post('/api/v1/resume/skills')
      .set(auth(accessToken))
      .send({ name: 'TypeScript' });

    const jobTargetRes = await request(app.getHttpServer())
      .post('/api/v1/job-targets')
      .set(auth(accessToken))
      .send({ title: 'Senior Backend Engineer', seniority: 'Senior' });
    const jobTargetId = jobTargetRes.body.data.id;

    const variantRes = await request(app.getHttpServer())
      .post('/api/v1/resume-variants')
      .set(auth(accessToken))
      .send({ title: 'Tailored for this role', jobTargetId });

    return { variantId: variantRes.body.data.id, jobTargetId };
  }

  // ---------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------

  describe('POST /template-recommendations', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/template-recommendations')
        .send({});
      expect(res.status).toBe(401);
    });

    it('recommends templates for a user with zero optional data — no Resume Variant, no Job Target — charging credits exactly once', async () => {
      const { userId, accessToken } = await registerAndLogin('no-data');
      await grantCredits(userId, 100, 'no-data');

      const res = await request(app.getHttpServer())
        .post('/api/v1/template-recommendations')
        .set(auth(accessToken))
        .send({});

      expect(res.status).toBe(201);
      const rec = res.body.data;
      expect(typeof rec.summary).toBe('string');
      expect(Array.isArray(rec.recommendations)).toBe(true);
      expect(rec.recommendations.length).toBeGreaterThan(0);
      for (const item of rec.recommendations) {
        expect(typeof item.templateId).toBe('string');
        expect(typeof item.rank).toBe('number');
        expect(typeof item.score).toBe('number');
        expect(typeof item.reason).toBe('string');
      }
      expect(rec.creditsUsed).toBe(COST);

      // Every recommended templateId genuinely exists in the real catalog.
      for (const item of rec.recommendations) {
        const template = await prisma.resumeTemplate.findUnique({ where: { id: item.templateId } });
        expect(template).not.toBeNull();
      }

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(100 - COST);
    });

    it('recommends templates when a Job Target is given directly, without a Resume Variant', async () => {
      const { userId, accessToken } = await registerAndLogin('with-job-target');
      await grantCredits(userId, 100, 'with-job-target');

      const jobTargetRes = await request(app.getHttpServer())
        .post('/api/v1/job-targets')
        .set(auth(accessToken))
        .send({ title: 'Staff Engineer', seniority: 'Staff' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/template-recommendations')
        .set(auth(accessToken))
        .send({ jobTargetId: jobTargetRes.body.data.id });

      expect(res.status).toBe(201);
      expect(res.body.data.contextSnapshot).toMatchObject({ hasJobTarget: true });

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(100 - COST);
    });

    it('recommends templates from a Resume Variant, deriving its linked Job Target automatically', async () => {
      const { userId, accessToken } = await registerAndLogin('with-variant');
      await grantCredits(userId, 100, 'with-variant');
      const { variantId } = await setUpVariantWithLinkedJobTarget(accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/template-recommendations')
        .set(auth(accessToken))
        .send({ resumeVariantId: variantId });

      expect(res.status).toBe(201);
      expect(res.body.data.resumeVariantId).toBe(variantId);
      expect(res.body.data.contextSnapshot).toMatchObject({
        hasResumeVariant: true,
        hasJobTarget: true,
      });

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(100 - COST);
    });

    it('rejects with an insufficient-credits error and charges nothing when the balance is too low', async () => {
      const { userId, accessToken } = await registerAndLogin('insufficient');
      // No credits granted.

      const res = await request(app.getHttpServer())
        .post('/api/v1/template-recommendations')
        .set(auth(accessToken))
        .send({});

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.success).toBe(false);

      const rows = await prisma.templateRecommendation.findMany({ where: { userId } });
      expect(rows).toHaveLength(0);
      const transactions = await prisma.creditTransaction.findMany({
        where: { userId, type: 'CONSUMPTION' },
      });
      expect(transactions).toHaveLength(0);
    });

    it('generates a real AiRequest row tracked as SUCCEEDED for the TEMPLATE_RECOMMENDATION feature', async () => {
      const { userId, accessToken } = await registerAndLogin('tracking');
      await grantCredits(userId, 100, 'tracking');

      await request(app.getHttpServer())
        .post('/api/v1/template-recommendations')
        .set(auth(accessToken))
        .send({});

      const aiRequest = await prisma.aiRequest.findFirst({
        where: { userId, feature: FEATURE_KEY },
      });
      expect(aiRequest).toMatchObject({
        status: 'SUCCEEDED',
        provider: 'dummy',
        creditsCharged: COST,
      });
    });
  });

  // ---------------------------------------------------------------------
  // Invalid JSON from the AI provider → refund
  // ---------------------------------------------------------------------

  describe('Invalid JSON from the AI provider', () => {
    it('rejects with 422, refunds the charge in full, and persists no row', async () => {
      const { userId, accessToken } = await registerAndLogin('invalid-json');
      await grantCredits(userId, 100, 'invalid-json');

      providerRegistry.register(new BrokenJsonProvider());
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/template-recommendations')
          .set(auth(accessToken))
          .send({});

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(100); // fully refunded, net zero

        const rows = await prisma.templateRecommendation.findMany({ where: { userId } });
        expect(rows).toHaveLength(0);
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    });
  });

  // ---------------------------------------------------------------------
  // AI names a nonexistent template — handled safely and deterministically
  // ---------------------------------------------------------------------

  describe('AI response references a nonexistent templateId', () => {
    it('is dropped and, when nothing else survives, treated as a refund-worthy failure — never persisted', async () => {
      const { userId, accessToken } = await registerAndLogin('fake-template-id');
      await grantCredits(userId, 100, 'fake-template-id');

      providerRegistry.register(new FakeTemplateIdProvider());
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/template-recommendations')
          .set(auth(accessToken))
          .send({});

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(100); // fully refunded

        const rows = await prisma.templateRecommendation.findMany({ where: { userId } });
        expect(rows).toHaveLength(0);

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
  // Idempotency
  // ---------------------------------------------------------------------

  describe('Idempotency', () => {
    it('replaying the same idempotencyKey through AiOrchestrationService for TEMPLATE_RECOMMENDATION never double-charges', async () => {
      const { userId } = await registerAndLogin('idempotent');
      await grantCredits(userId, 100, 'idempotent');
      const idempotencyKey = `template-recommendation-idempotent-${randomUUID()}`;
      const input = {
        context: {
          masterResume: null,
          workExperienceCount: 0,
          educationCount: 0,
          skillsCount: 0,
          languages: [],
          resumeVariant: null,
          jobTarget: null,
          availableTemplates: (
            await prisma.resumeTemplate.findMany({ where: { status: 'ACTIVE' }, take: 3 })
          ).map((t) => ({
            id: t.id,
            name: t.name,
            category: t.category,
            isATSFriendly: t.isATSFriendly,
            premium: t.premium,
          })),
        },
      };

      const first = await orchestrationService.execute({
        userId,
        feature: FEATURE_KEY,
        input,
        idempotencyKey,
      });
      const second = await orchestrationService.execute({
        userId,
        feature: FEATURE_KEY,
        input,
        idempotencyKey,
      });

      expect(second.aiRequestId).toBe(first.aiRequestId);

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(100 - COST); // charged exactly once

      const aiRequests = await prisma.aiRequest.findMany({
        where: { userId, feature: FEATURE_KEY },
      });
      expect(aiRequests).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------
  // List / Get + Ownership
  // ---------------------------------------------------------------------

  describe('GET /template-recommendations and /template-recommendations/:id', () => {
    it("lists and reads back only the current user's own recommendations, and 404s for another user's recommendation id", async () => {
      const userA = await registerAndLogin('ownership-a');
      const userB = await registerAndLogin('ownership-b');
      await grantCredits(userA.userId, 100, 'ownership-a');
      await grantCredits(userB.userId, 100, 'ownership-b');

      const created = await request(app.getHttpServer())
        .post('/api/v1/template-recommendations')
        .set(auth(userA.accessToken))
        .send({});
      const id = created.body.data.id;

      const listA = await request(app.getHttpServer())
        .get('/api/v1/template-recommendations')
        .set(auth(userA.accessToken));
      expect(listA.body.data.map((r: { id: string }) => r.id)).toContain(id);

      const listB = await request(app.getHttpServer())
        .get('/api/v1/template-recommendations')
        .set(auth(userB.accessToken));
      expect(listB.body.data.map((r: { id: string }) => r.id)).not.toContain(id);

      const getOwn = await request(app.getHttpServer())
        .get(`/api/v1/template-recommendations/${id}`)
        .set(auth(userA.accessToken));
      expect(getOwn.status).toBe(200);

      const getCross = await request(app.getHttpServer())
        .get(`/api/v1/template-recommendations/${id}`)
        .set(auth(userB.accessToken));
      expect(getCross.status).toBe(404);
    });
  });

  describe('Admin access', () => {
    it("an admin can read another user's recommendation via the service-level bypass (self-service-only controller, established pattern)", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAdmin('admin-actor');
      await grantCredits(owner.userId, 100, 'admin-target');

      const created = await request(app.getHttpServer())
        .post('/api/v1/template-recommendations')
        .set(auth(owner.accessToken))
        .send({});

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const single = await templateRecommendationService.getOne(
        adminRequestUser,
        owner.userId,
        created.body.data.id,
      );
      expect(single.id).toBe(created.body.data.id);
    });
  });
});
