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
import { AtsAiService } from '../src/ats-ai/ats-ai.service';
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
 * Covers FASE 20's ATS AI Engine end-to-end against the real Postgres/Redis
 * from docker-compose.yml — mirrors career-advisor.e2e-spec.ts's (FASE 18)/
 * linkedin.e2e-spec.ts's (FASE 19) structure exactly. Every test that needs
 * an AtsReport builds one for real through the existing, unchanged
 * POST /ats/run endpoint — this suite never seeds AtsReport rows directly,
 * proving ATS AI genuinely consumes the deterministic engine's real output
 * rather than a stand-in. Per FASE 20's brief: does NOT duplicate scenarios
 * already covered generically by ai-orchestration.e2e-spec.ts (retry
 * policy, generic refund-on-Build-Prompt-failure, generic idempotency
 * mechanics) except where ATS AI's own integration specifically needs
 * proving.
 */
describe('ATS AI Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let orchestrationService: AiOrchestrationService;
  let providerRegistry: ProviderRegistry;
  let atsAiService: AtsAiService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `ats-ai-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  const FEATURE_KEY = AIFeature.ATS_AI;
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
    atsAiService = moduleRef.get(AtsAiService);

    // Scoped to this file only, created and torn down here — feature_pricing
    // has no general seed mechanism yet (a known, documented gap; see
    // seed-templates.ts's own doc comment), so every e2e spec manages its
    // own temporary row, same as career-advisor.e2e-spec.ts's/
    // linkedin.e2e-spec.ts's precedent.
    await prisma.featurePricing.createMany({
      data: [{ featureKey: FEATURE_KEY, cost: COST, active: true }],
    });
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `ats-ai-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        await prisma.atsAiAnalysis.deleteMany({ where: { userId: { in: userIds } } });

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
          prisma.atsReport.deleteMany({ where: { userId: { in: userIds } } }),
          prisma.resumeVariant.deleteMany({ where: { userId: { in: userIds } } }),
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

  async function grantCredits(userId: string, amount: number, label: string): Promise<void> {
    await creditService.adjustBalance(userId, {
      userId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
      reason: 'Test fixture setup',
      idempotencyKey: `${label}-grant-${randomUUID()}`,
    });
  }

  /** Builds a real, deterministic AtsReport through the existing, unchanged POST /ats/run endpoint — this suite never seeds one directly. */
  async function setUpAtsReport(
    accessToken: string,
  ): Promise<{ atsReportId: string; variantId: string }> {
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

    const jobTargetRes = await request(app.getHttpServer())
      .post('/api/v1/job-targets')
      .set(auth(accessToken))
      .send({
        title: 'Senior Backend Engineer',
        seniority: 'Senior',
        keywords: [{ keyword: 'Kubernetes' }],
        skills: [{ skill: 'Docker', required: true }],
      });
    const jobTargetId = jobTargetRes.body.data.id;

    const variantRes = await request(app.getHttpServer())
      .post('/api/v1/resume-variants')
      .set(auth(accessToken))
      .send({ title: 'Tailored for this role', jobTargetId });
    const variantId = variantRes.body.data.id;

    const runRes = await request(app.getHttpServer())
      .post('/api/v1/ats/run')
      .set(auth(accessToken))
      .send({ resumeVariantId: variantId });

    return { atsReportId: runRes.body.data.id, variantId };
  }

  // ---------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------

  describe('POST /ats-ai/analyze', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ats-ai/analyze')
        .send({ atsReportId: 'x' });
      expect(res.status).toBe(401);
    });

    it('analyzes a real AtsReport, charging credits exactly once, without altering the deterministic report', async () => {
      const { userId, accessToken } = await registerAndLogin('happy-path');
      await grantCredits(userId, 100, 'happy-path');
      const { atsReportId } = await setUpAtsReport(accessToken);

      const beforeReport = await prisma.atsReport.findUnique({ where: { id: atsReportId } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/ats-ai/analyze')
        .set(auth(accessToken))
        .send({ atsReportId });

      expect(res.status).toBe(201);
      const analysis = res.body.data;
      expect(analysis.atsReportId).toBe(atsReportId);
      expect(typeof analysis.overallAssessment).toBe('string');
      expect(Array.isArray(analysis.strengths)).toBe(true);
      expect(Array.isArray(analysis.priorityIssues)).toBe(true);
      expect(Array.isArray(analysis.contentRecommendations)).toBe(true);
      expect(Array.isArray(analysis.sectionRecommendations)).toBe(true);
      expect(Array.isArray(analysis.actionPlan)).toBe(true);
      expect(analysis.creditsUsed).toBe(COST);

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(100 - COST);

      // The deterministic AtsReport row itself is untouched by the AI analysis.
      const afterReport = await prisma.atsReport.findUnique({ where: { id: atsReportId } });
      expect(afterReport).toEqual(beforeReport);
    });

    it('rejects an invalid/non-existent atsReportId with 404', async () => {
      const { userId, accessToken } = await registerAndLogin('invalid-report');
      await grantCredits(userId, 100, 'invalid-report');

      const res = await request(app.getHttpServer())
        .post('/api/v1/ats-ai/analyze')
        .set(auth(accessToken))
        .send({ atsReportId: randomUUID() });

      expect(res.status).toBe(404);
      const transactions = await prisma.creditTransaction.findMany({
        where: { userId, type: 'CONSUMPTION' },
      });
      expect(transactions).toHaveLength(0);
    });

    it('rejects an ATS report belonging to another user with 404, charging nothing', async () => {
      const userA = await registerAndLogin('cross-user-a');
      const userB = await registerAndLogin('cross-user-b');
      await grantCredits(userA.userId, 100, 'cross-user-a');
      await grantCredits(userB.userId, 100, 'cross-user-b');
      const { atsReportId } = await setUpAtsReport(userA.accessToken);

      const res = await request(app.getHttpServer())
        .post('/api/v1/ats-ai/analyze')
        .set(auth(userB.accessToken))
        .send({ atsReportId });

      expect(res.status).toBe(404);
      const transactions = await prisma.creditTransaction.findMany({
        where: { userId: userB.userId, type: 'CONSUMPTION' },
      });
      expect(transactions).toHaveLength(0);
    });

    it('rejects with an insufficient-credits error and charges nothing when the balance is too low', async () => {
      const { accessToken } = await registerAndLogin('insufficient');
      const { atsReportId } = await setUpAtsReport(accessToken);
      // No credits granted.

      const res = await request(app.getHttpServer())
        .post('/api/v1/ats-ai/analyze')
        .set(auth(accessToken))
        .send({ atsReportId });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.success).toBe(false);

      const rows = await prisma.atsAiAnalysis.findMany({ where: { atsReportId } });
      expect(rows).toHaveLength(0);
    });

    it('generates a real AiRequest row tracked as SUCCEEDED for the ATS_AI feature', async () => {
      const { userId, accessToken } = await registerAndLogin('tracking');
      await grantCredits(userId, 100, 'tracking');
      const { atsReportId } = await setUpAtsReport(accessToken);

      await request(app.getHttpServer())
        .post('/api/v1/ats-ai/analyze')
        .set(auth(accessToken))
        .send({ atsReportId });

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
      const { atsReportId } = await setUpAtsReport(accessToken);

      providerRegistry.register(new BrokenJsonProvider());
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/ats-ai/analyze')
          .set(auth(accessToken))
          .send({ atsReportId });

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(100); // fully refunded, net zero

        const rows = await prisma.atsAiAnalysis.findMany({ where: { userId } });
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
    it('replaying the same idempotencyKey through AiOrchestrationService for ATS_AI never double-charges', async () => {
      const { userId } = await registerAndLogin('idempotent');
      await grantCredits(userId, 100, 'idempotent');
      const idempotencyKey = `ats-ai-idempotent-${randomUUID()}`;
      const input = {
        context: {
          atsReport: {
            overallScore: 50,
            keywordScore: 50,
            skillsScore: 50,
            experienceScore: 50,
            educationScore: 50,
            languageScore: 50,
            formattingScore: 50,
            completionScore: 50,
            matchedKeywords: [],
            missingKeywords: [],
            recommendedSkills: [],
            recommendations: [],
          },
          jobTarget: {
            title: 'Role',
            company: null,
            seniority: null,
            keywords: [],
            skills: [],
            languages: [],
          },
          resume: { title: 'Resume' },
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

  describe('GET /ats-ai/analyses and /ats-ai/analyses/:id', () => {
    it("lists and reads back only the current user's own analyses, and 404s for another user's analysis id", async () => {
      const userA = await registerAndLogin('ownership-a');
      const userB = await registerAndLogin('ownership-b');
      await grantCredits(userA.userId, 100, 'ownership-a');
      await grantCredits(userB.userId, 100, 'ownership-b');
      const { atsReportId } = await setUpAtsReport(userA.accessToken);

      const created = await request(app.getHttpServer())
        .post('/api/v1/ats-ai/analyze')
        .set(auth(userA.accessToken))
        .send({ atsReportId });
      const id = created.body.data.id;

      const listA = await request(app.getHttpServer())
        .get('/api/v1/ats-ai/analyses')
        .set(auth(userA.accessToken));
      expect(listA.body.data.map((a: { id: string }) => a.id)).toContain(id);

      const listB = await request(app.getHttpServer())
        .get('/api/v1/ats-ai/analyses')
        .set(auth(userB.accessToken));
      expect(listB.body.data.map((a: { id: string }) => a.id)).not.toContain(id);

      const getOwn = await request(app.getHttpServer())
        .get(`/api/v1/ats-ai/analyses/${id}`)
        .set(auth(userA.accessToken));
      expect(getOwn.status).toBe(200);

      const getCross = await request(app.getHttpServer())
        .get(`/api/v1/ats-ai/analyses/${id}`)
        .set(auth(userB.accessToken));
      expect(getCross.status).toBe(404);
    });
  });

  describe('Admin access', () => {
    it("an admin can read another user's analysis via the service-level bypass (self-service-only controller, established pattern)", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAdmin('admin-actor');
      await grantCredits(owner.userId, 100, 'admin-target');
      const { atsReportId } = await setUpAtsReport(owner.accessToken);

      const created = await request(app.getHttpServer())
        .post('/api/v1/ats-ai/analyze')
        .set(auth(owner.accessToken))
        .send({ atsReportId });

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const single = await atsAiService.getOne(
        adminRequestUser,
        owner.userId,
        created.body.data.id,
      );
      expect(single.id).toBe(created.body.data.id);
    });
  });
});
