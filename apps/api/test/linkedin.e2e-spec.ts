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
import { LinkedInService } from '../src/linkedin/linkedin.service';
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
 * Covers FASE 19's LinkedIn / Professional Profile Engine end-to-end
 * against the real Postgres/Redis from docker-compose.yml — mirrors
 * career-advisor.e2e-spec.ts's (FASE 18) structure exactly, narrowed to
 * this feature's own context scope. Per FASE 19's brief: does NOT duplicate
 * scenarios already covered generically by ai-orchestration.e2e-spec.ts
 * (retry policy, generic refund-on-Build-Prompt-failure, generic
 * idempotency mechanics) except where LinkedIn's own integration
 * specifically needs proving.
 */
describe('LinkedIn / Professional Profile Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let orchestrationService: AiOrchestrationService;
  let providerRegistry: ProviderRegistry;
  let linkedInService: LinkedInService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `linkedin-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  const FEATURE_KEY = AIFeature.LINKEDIN;
  const COST = 30;

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

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    creditService = moduleRef.get(CreditService);
    orchestrationService = moduleRef.get(AiOrchestrationService);
    providerRegistry = moduleRef.get(ProviderRegistry);
    linkedInService = moduleRef.get(LinkedInService);

    // Scoped to this file only, created and torn down here — feature_pricing
    // has no general seed mechanism yet (a known, documented gap; see
    // seed-templates.ts's own doc comment), so every e2e spec manages its
    // own temporary row, same as career-advisor.e2e-spec.ts's precedent.
    await prisma.featurePricing.createMany({
      data: [{ featureKey: FEATURE_KEY, cost: COST, active: true }],
    });
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `linkedin-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        await prisma.linkedInProfile.deleteMany({ where: { userId: { in: userIds } } });

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

        await prisma.$transaction([
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

  // ---------------------------------------------------------------------
  // Happy path — no resume data at all (graceful degradation)
  // ---------------------------------------------------------------------

  describe('POST /linkedin/profile', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/linkedin/profile')
        .send({ targetRole: 'Staff Engineer' });
      expect(res.status).toBe(401);
    });

    it('generates a profile for a user with zero optional data (profile/resume/job targets all absent), charging credits exactly once', async () => {
      const { userId, accessToken } = await registerAndLogin('no-data');
      await grantCredits(userId, 100, 'no-data');

      const res = await request(app.getHttpServer())
        .post('/api/v1/linkedin/profile')
        .set(auth(accessToken))
        .send({});

      expect(res.status).toBe(201);
      const profile = res.body.data;
      expect(typeof profile.headline).toBe('string');
      expect(typeof profile.about).toBe('string');
      expect(Array.isArray(profile.skills)).toBe(true);
      expect(Array.isArray(profile.experienceSuggestions)).toBe(true);
      expect(Array.isArray(profile.recommendations)).toBe(true);
      expect(profile.creditsUsed).toBe(COST);
      expect(profile.contextSnapshot).toMatchObject({ hasProfile: false, hasMasterResume: false });

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(100 - COST);
    });

    it('accepts an optional targetRole and persists it verbatim', async () => {
      const { userId, accessToken } = await registerAndLogin('target-role');
      await grantCredits(userId, 100, 'target-role');

      const res = await request(app.getHttpServer())
        .post('/api/v1/linkedin/profile')
        .set(auth(accessToken))
        .send({ targetRole: 'Staff Engineer' });

      expect(res.status).toBe(201);
      expect(res.body.data.targetRole).toBe('Staff Engineer');
    });

    it('rejects with an insufficient-credits error and charges nothing when the balance is too low', async () => {
      const { userId, accessToken } = await registerAndLogin('insufficient');
      // No credits granted.

      const res = await request(app.getHttpServer())
        .post('/api/v1/linkedin/profile')
        .set(auth(accessToken))
        .send({});

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.success).toBe(false);

      const rows = await prisma.linkedInProfile.findMany({ where: { userId } });
      expect(rows).toHaveLength(0);
      const transactions = await prisma.creditTransaction.findMany({ where: { userId } });
      expect(transactions).toHaveLength(0);
    });

    it('generates a real AiRequest row tracked as SUCCEEDED for the LINKEDIN feature', async () => {
      const { userId, accessToken } = await registerAndLogin('tracking');
      await grantCredits(userId, 100, 'tracking');

      await request(app.getHttpServer())
        .post('/api/v1/linkedin/profile')
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

    it('gathers Master Resume + section context and still succeeds when a real profile/resume exists', async () => {
      const { userId, accessToken } = await registerAndLogin('with-resume');
      await grantCredits(userId, 100, 'with-resume');

      await request(app.getHttpServer())
        .post('/api/v1/resume')
        .set(auth(accessToken))
        .send({ title: 'My Resume', summary: 'Experienced backend engineer.', yearsExperience: 5 });
      await request(app.getHttpServer())
        .post('/api/v1/resume/skills')
        .set(auth(accessToken))
        .send({ name: 'TypeScript' });
      await request(app.getHttpServer())
        .post('/api/v1/resume/work-experience')
        .set(auth(accessToken))
        .send({ company: 'Acme', position: 'Engineer', startDate: '2020-01-01' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/linkedin/profile')
        .set(auth(accessToken))
        .send({ targetRole: 'Staff Engineer' });

      expect(res.status).toBe(201);
      expect(res.body.data.contextSnapshot).toMatchObject({
        hasMasterResume: true,
        workExperienceCount: 1,
        skillsCount: 1,
      });

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(100 - COST);
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
          .post('/api/v1/linkedin/profile')
          .set(auth(accessToken))
          .send({});

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(100); // fully refunded, net zero

        const rows = await prisma.linkedInProfile.findMany({ where: { userId } });
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
  // Idempotency — proving LinkedIn's registration integrates correctly
  // with the existing shared idempotency mechanism (not re-testing the
  // mechanism itself, already covered generically by
  // ai-orchestration.e2e-spec.ts).
  // ---------------------------------------------------------------------

  describe('Idempotency', () => {
    it('replaying the same idempotencyKey through AiOrchestrationService for LINKEDIN never double-charges', async () => {
      const { userId } = await registerAndLogin('idempotent');
      await grantCredits(userId, 100, 'idempotent');
      const idempotencyKey = `linkedin-idempotent-${randomUUID()}`;
      const input = {
        targetRole: null,
        context: {
          profile: null,
          masterResume: null,
          workExperience: [],
          education: [],
          skills: [],
          jobTargets: [],
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

  describe('GET /linkedin/profile and /linkedin/profile/:id', () => {
    it("lists and reads back only the current user's own profiles, and 404s for another user's profile id", async () => {
      const userA = await registerAndLogin('ownership-a');
      const userB = await registerAndLogin('ownership-b');
      await grantCredits(userA.userId, 100, 'ownership-a');
      await grantCredits(userB.userId, 100, 'ownership-b');

      const created = await request(app.getHttpServer())
        .post('/api/v1/linkedin/profile')
        .set(auth(userA.accessToken))
        .send({});
      const id = created.body.data.id;

      const listA = await request(app.getHttpServer())
        .get('/api/v1/linkedin/profile')
        .set(auth(userA.accessToken));
      expect(listA.body.data.map((p: { id: string }) => p.id)).toContain(id);

      const listB = await request(app.getHttpServer())
        .get('/api/v1/linkedin/profile')
        .set(auth(userB.accessToken));
      expect(listB.body.data.map((p: { id: string }) => p.id)).not.toContain(id);

      const getOwn = await request(app.getHttpServer())
        .get(`/api/v1/linkedin/profile/${id}`)
        .set(auth(userA.accessToken));
      expect(getOwn.status).toBe(200);

      const getCross = await request(app.getHttpServer())
        .get(`/api/v1/linkedin/profile/${id}`)
        .set(auth(userB.accessToken));
      expect(getCross.status).toBe(404);
    });
  });

  describe('Admin access', () => {
    it("an admin can read another user's profile via the service-level bypass (self-service-only controller, established pattern)", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAndLogin('admin-actor');
      await prisma.user.update({ where: { id: admin.userId }, data: { role: 'ADMIN' } });
      await grantCredits(owner.userId, 100, 'admin-target');

      const created = await request(app.getHttpServer())
        .post('/api/v1/linkedin/profile')
        .set(auth(owner.accessToken))
        .send({});

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const single = await linkedInService.getOne(
        adminRequestUser,
        owner.userId,
        created.body.data.id,
      );
      expect(single.id).toBe(created.body.data.id);
    });
  });
});
