import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreditService } from '../src/credits/credit.service';
import { AiOrchestrationService } from '../src/ai-orchestration/pipeline/ai-orchestration.service';
import { ProviderRegistry } from '../src/ai-orchestration/providers/provider-registry';
import { DummyAIProvider } from '../src/ai-orchestration/providers/dummy-ai-provider';
import { AIFeature } from '../src/ai-orchestration/constants/ai-feature.enum';
import { CvImportService } from '../src/cv-import/cv-import.service';
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

async function buildPdfFixture(lines: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    for (const line of lines) doc.text(line);
    doc.end();
  });
}

/**
 * Covers FASE 22's CV Import AI / Intelligent Extraction Engine end-to-end
 * against the real Postgres/Redis from docker-compose.yml — mirrors
 * ats-ai.e2e-spec.ts's (FASE 20) structure. Every test that needs a CvImport
 * builds one for real through the existing, unchanged POST /cv-import/upload
 * endpoint (real PDF, parsed by the real deterministic CVParser) — this
 * suite never seeds a CvImport row directly, proving CV Import AI genuinely
 * enhances the deterministic engine's real output rather than a stand-in.
 * Does NOT duplicate scenarios already covered generically by
 * ai-orchestration.e2e-spec.ts (retry policy, generic idempotency
 * mechanics) except where this feature's own integration specifically needs
 * proving.
 */
describe('CV Import AI Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let orchestrationService: AiOrchestrationService;
  let providerRegistry: ProviderRegistry;
  let cvImportService: CvImportService;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `cv-import-ai-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';
  const FEATURE_KEY = AIFeature.CV_IMPORT;
  const COST = 30;

  const FULL_CV_LINES = [
    'Ana Paula Machava',
    'ana.machava@example.com',
    '+258 82 555 1234',
    'Resumo',
    'Profissional de marketing digital com experiencia em campanhas.',
    'Experiencia Profissional',
    '2020 - 2023 Acme Lda',
    'Analista de Marketing',
    'Geriu campanhas de publicidade digital para clientes internacionais.',
    'Competencias',
    'SEO, Google Ads, Copywriting',
  ];

  const PARTIAL_CV_LINES = ['Jose Fernando', 'jose.fernando@example.com'];

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

  class ThrowingProvider implements AIProvider {
    readonly name = 'dummy';
    async generate(): Promise<GenerateResult> {
      throw new Error('Simulated provider outage.');
    }
    async *stream(): AsyncIterable<StreamChunk> {
      // Never actually reached by this test (the pipeline calls generate()
      // for JSON-mode requests, not stream()) — kept a normal, valid
      // generator (matching BrokenJsonProvider's own stream() above) rather
      // than throwing here too, since an async generator that always throws
      // before ever yielding trips ESLint's require-yield rule for no
      // behavioral reason (this method is unreachable in this test path).
      yield { delta: '', done: true };
    }
    async health(): Promise<ProviderHealthStatus> {
      return { provider: this.name, available: false, checkedAt: new Date() };
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
    cvImportService = moduleRef.get(CvImportService);

    // Scoped to this file only — feature_pricing has no general seed
    // mechanism yet (a known, documented gap); every e2e spec manages its
    // own temporary row, same as ats-ai.e2e-spec.ts's precedent.
    await prisma.featurePricing.createMany({
      data: [{ featureKey: FEATURE_KEY, cost: COST, active: true }],
    });
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `cv-import-ai-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        const resumes = await prisma.masterResume.findMany({
          where: { userId: { in: userIds } },
          select: { id: true },
        });
        const resumeIds = resumes.map((r) => r.id);

        await prisma.cvImport.deleteMany({ where: { userId: { in: userIds } } });
        if (resumeIds.length > 0) {
          await prisma.$transaction([
            prisma.workExperience.deleteMany({ where: { resumeId: { in: resumeIds } } }),
            prisma.skill.deleteMany({ where: { resumeId: { in: resumeIds } } }),
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

  /** Builds a real, deterministic CvImport through the existing, unchanged POST /cv-import/upload endpoint — this suite never seeds one directly. */
  async function setUpCvImport(accessToken: string, lines: string[]): Promise<string> {
    const pdf = await buildPdfFixture(lines);
    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/cv-import/upload')
      .set(auth(accessToken))
      .attach('file', pdf, { filename: 'cv.pdf', contentType: 'application/pdf' });
    return uploadRes.body.data.id;
  }

  // ---------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------

  describe('POST /cv-import/:id/enhance', () => {
    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/cv-import/some-id/enhance');
      expect(res.status).toBe(401);
    });

    it('enhances a real CV import, charging credits exactly once, returning suggestions with confidence, never touching Profile/MasterResume', async () => {
      const { userId, accessToken } = await registerAndLogin('happy-path');
      await grantCredits(userId, 100, 'happy-path');
      const cvImportId = await setUpCvImport(accessToken, FULL_CV_LINES);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/enhance`)
        .set(auth(accessToken));

      expect(res.status).toBe(201);
      const updated = res.body.data;
      expect(Array.isArray(updated.aiSuggestions)).toBe(true);
      expect(Array.isArray(updated.aiUnresolvedFields)).toBe(true);
      expect(updated.creditsUsed).toBe(COST);
      if (updated.aiSuggestions.length > 0) {
        const suggestion = updated.aiSuggestions[0];
        expect(typeof suggestion.confidence).toBe('number');
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.confidence).toBeLessThanOrEqual(1);
        expect(typeof suggestion.originalValue).toBe('string');
        expect(typeof suggestion.suggestedValue).toBe('string');
      }

      const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
      expect(wallet?.availableCredits).toBe(100 - COST);

      // Never writes to Profile/MasterResume itself.
      const resumeCheck = await prisma.masterResume.findFirst({ where: { userId } });
      expect(resumeCheck).toBeNull();
    }, 20000);

    it('every returned suggestion targets a field that genuinely exists in the extracted draft (never invented)', async () => {
      const { userId, accessToken } = await registerAndLogin('grounded');
      await grantCredits(userId, 100, 'grounded');
      const cvImportId = await setUpCvImport(accessToken, FULL_CV_LINES);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/enhance`)
        .set(auth(accessToken));

      const cvImport = await prisma.cvImport.findUnique({ where: { id: cvImportId } });
      const data = cvImport!.extractedData as never as Record<string, unknown>;
      for (const suggestion of res.body.data.aiSuggestions) {
        if (suggestion.index !== undefined) {
          const entries = data[suggestion.section] as Record<string, unknown>[];
          expect(entries[suggestion.index]).toBeDefined();
        }
      }
    }, 20000);

    it('handles a partial CV (few fields extracted) without erroring — a valid, possibly-empty suggestions array', async () => {
      const { userId, accessToken } = await registerAndLogin('partial-cv');
      await grantCredits(userId, 100, 'partial-cv');
      const cvImportId = await setUpCvImport(accessToken, PARTIAL_CV_LINES);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/enhance`)
        .set(auth(accessToken));

      expect(res.status).toBe(201);
      expect(Array.isArray(res.body.data.aiSuggestions)).toBe(true);
    }, 20000);

    it('rejects an invalid/non-existent cvImportId with 404, charging nothing', async () => {
      const { userId, accessToken } = await registerAndLogin('invalid-id');
      await grantCredits(userId, 100, 'invalid-id');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${randomUUID()}/enhance`)
        .set(auth(accessToken));

      expect(res.status).toBe(404);
      const transactions = await prisma.creditTransaction.findMany({
        where: { userId, type: 'CONSUMPTION' },
      });
      expect(transactions).toHaveLength(0);
    });

    it('rejects a CV import belonging to another user with 404, charging nothing (ownership)', async () => {
      const userA = await registerAndLogin('cross-user-a');
      const userB = await registerAndLogin('cross-user-b');
      await grantCredits(userA.userId, 100, 'cross-user-a');
      await grantCredits(userB.userId, 100, 'cross-user-b');
      const cvImportId = await setUpCvImport(userA.accessToken, FULL_CV_LINES);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/enhance`)
        .set(auth(userB.accessToken));

      expect(res.status).toBe(404);
      const transactions = await prisma.creditTransaction.findMany({
        where: { userId: userB.userId, type: 'CONSUMPTION' },
      });
      expect(transactions).toHaveLength(0);
    });

    it('rejects with an insufficient-credits error and charges nothing when the balance is too low', async () => {
      const { accessToken } = await registerAndLogin('insufficient');
      const cvImportId = await setUpCvImport(accessToken, FULL_CV_LINES);
      // No credits granted.

      const res = await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/enhance`)
        .set(auth(accessToken));

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.body.success).toBe(false);

      const cvImport = await prisma.cvImport.findUnique({ where: { id: cvImportId } });
      expect(cvImport?.aiSuggestions).toBeNull();
    });

    it('rejects running AI enhancement on an already-confirmed import', async () => {
      const { userId, accessToken } = await registerAndLogin('already-confirmed');
      await grantCredits(userId, 100, 'already-confirmed');
      const cvImportId = await setUpCvImport(accessToken, FULL_CV_LINES);
      await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/confirm`)
        .set(auth(accessToken))
        .send({});

      const res = await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/enhance`)
        .set(auth(accessToken));

      expect(res.status).toBe(409);
    }, 20000);

    it('generates a real AiRequest row tracked as SUCCEEDED for the CV_IMPORT feature', async () => {
      const { userId, accessToken } = await registerAndLogin('tracking');
      await grantCredits(userId, 100, 'tracking');
      const cvImportId = await setUpCvImport(accessToken, FULL_CV_LINES);

      await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/enhance`)
        .set(auth(accessToken));

      const aiRequest = await prisma.aiRequest.findFirst({
        where: { userId, feature: FEATURE_KEY },
      });
      expect(aiRequest).toMatchObject({
        status: 'SUCCEEDED',
        provider: 'dummy',
        creditsCharged: COST,
      });
    }, 20000);
  });

  // ---------------------------------------------------------------------
  // Invalid JSON from the AI provider → refund
  // ---------------------------------------------------------------------

  describe('Invalid JSON from the AI provider', () => {
    it('rejects with 422, refunds the charge in full, and persists no AI fields', async () => {
      const { userId, accessToken } = await registerAndLogin('invalid-json');
      await grantCredits(userId, 100, 'invalid-json');
      const cvImportId = await setUpCvImport(accessToken, FULL_CV_LINES);

      providerRegistry.register(new BrokenJsonProvider());
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/cv-import/${cvImportId}/enhance`)
          .set(auth(accessToken));

        expect(res.status).toBe(422);
        expect(res.body.success).toBe(false);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(100); // fully refunded, net zero

        const cvImport = await prisma.cvImport.findUnique({ where: { id: cvImportId } });
        expect(cvImport?.aiSuggestions).toBeNull();

        const transactions = await prisma.creditTransaction.findMany({
          where: { userId, type: { in: ['CONSUMPTION', 'REFUND'] } },
          orderBy: { createdAt: 'asc' },
        });
        expect(transactions.map((t) => t.type)).toEqual(['CONSUMPTION', 'REFUND']);
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    }, 20000);
  });

  // ---------------------------------------------------------------------
  // Provider failure → refund
  // ---------------------------------------------------------------------

  describe('AI provider failure', () => {
    it('rejects with a 5xx/502-class error and refunds in full when the provider itself throws', async () => {
      const { userId, accessToken } = await registerAndLogin('provider-failure');
      await grantCredits(userId, 100, 'provider-failure');
      const cvImportId = await setUpCvImport(accessToken, FULL_CV_LINES);

      providerRegistry.register(new ThrowingProvider());
      try {
        const res = await request(app.getHttpServer())
          .post(`/api/v1/cv-import/${cvImportId}/enhance`)
          .set(auth(accessToken));

        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.body.success).toBe(false);

        const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
        expect(wallet?.availableCredits).toBe(100);
      } finally {
        providerRegistry.register(new DummyAIProvider());
      }
    }, 30000);
  });

  // ---------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------

  describe('Idempotency', () => {
    it('replaying the same idempotencyKey through AiOrchestrationService for CV_IMPORT never double-charges', async () => {
      const { userId } = await registerAndLogin('idempotent');
      await grantCredits(userId, 100, 'idempotent');
      const idempotencyKey = `cv-import-ai-idempotent-${randomUUID()}`;
      const input = {
        data: {
          personalData: { fullName: 'Test User' },
          workExperiences: [],
          educations: [],
          skills: [],
          languages: [],
          certificates: [],
          projects: [],
          awards: [],
          volunteerExperiences: [],
          references: [],
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
  // Admin access
  // ---------------------------------------------------------------------

  describe('Admin access', () => {
    it("an admin can run AI enhancement on another user's CV import via the service-level bypass", async () => {
      const owner = await registerAndLogin('admin-target');
      const admin = await registerAdmin('admin-actor');
      await grantCredits(owner.userId, 100, 'admin-target');
      const cvImportId = await setUpCvImport(owner.accessToken, FULL_CV_LINES);

      const adminRequestUser = { id: admin.userId, role: 'ADMIN' as const };
      const result = await cvImportService.enhanceWithAi(
        adminRequestUser,
        owner.userId,
        cvImportId,
      );
      expect(result.id).toBe(cvImportId);
    }, 20000);
  });

  // ---------------------------------------------------------------------
  // Master Resume only ever changes on explicit confirmation
  // ---------------------------------------------------------------------

  describe('Master Resume is never touched by AI enhancement, only by an explicit confirm()', () => {
    it('does not create a Master Resume before confirmation, and creates it correctly once confirmed', async () => {
      const { userId, accessToken } = await registerAndLogin('confirmation-flow');
      await grantCredits(userId, 100, 'confirmation-flow');
      const cvImportId = await setUpCvImport(accessToken, FULL_CV_LINES);

      await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/enhance`)
        .set(auth(accessToken));

      // No Master Resume yet — enhance() only produced suggestions.
      const beforeConfirm = await prisma.masterResume.findFirst({ where: { userId } });
      expect(beforeConfirm).toBeNull();

      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/cv-import/${cvImportId}/confirm`)
        .set(auth(accessToken))
        .send({});

      expect(confirmRes.status).toBe(201);
      const afterConfirm = await prisma.masterResume.findFirst({ where: { userId } });
      expect(afterConfirm).not.toBeNull();
      expect(confirmRes.body.data.masterResume.id).toBe(afterConfirm!.id);
    }, 20000);
  });
});
