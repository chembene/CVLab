import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreditService } from '../src/credits/credit.service';
import { AiOrchestrationService } from '../src/ai-orchestration/pipeline/ai-orchestration.service';
import { PromptRegistry } from '../src/ai-orchestration/prompt/prompt-registry';
import { ProviderRegistry } from '../src/ai-orchestration/providers/provider-registry';
import { AIFeature } from '../src/ai-orchestration/constants/ai-feature.enum';
import { PromptHash } from '../src/ai-orchestration/prompt/prompt-hash.util';
import { PromptBuilderNotFoundError } from '../src/ai-orchestration/errors/prompt-builder-not-found.error';
import { RetryLimitExceededError } from '../src/ai-orchestration/errors/retry-limit-exceeded.error';
import { ProviderUnavailableError } from '../src/ai-orchestration/errors/provider-unavailable.error';
import { InsufficientCreditsException } from '../src/credits/errors/insufficient-credits.exception';
import type {
  PromptBuilder,
  PromptContext,
  PromptResult,
} from '../src/ai-orchestration/interfaces/prompt.interface';
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
 * Covers the Phase 6 AI Orchestration Engine end-to-end against the real
 * Postgres from docker-compose.yml — the same "call the real service
 * through the app's DI container, no HTTP endpoint needed" pattern
 * credit-engine.e2e-spec.ts established in Phase 5 (no controller exists
 * here either, deliberately — no AI feature is implemented yet). A test
 * PromptBuilder is registered into the real PromptRegistry singleton for
 * AIFeature.COVER_LETTER, and a call-counting, always-failing AIProvider is
 * registered into the real ProviderRegistry to exercise the retry +
 * automatic-refund paths without needing DummyAIProvider to ever fail.
 */
describe('AI Orchestration Engine (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let creditService: CreditService;
  let orchestrationService: AiOrchestrationService;
  let promptRegistry: PromptRegistry;
  let throttlerSpy: jest.SpyInstance;
  const testRunId = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `ai-orch-e2e-${testRunId}-${label}@example.com`;
  const PASSWORD = 'Sup3rSecret1';

  let failingProviderCallCount = 0;
  const FAILING_PROVIDER_NAME = `failing-test-provider-${testRunId}`;

  class TestCoverLetterPromptBuilder implements PromptBuilder<{ text: string }> {
    readonly metadata = { feature: AIFeature.COVER_LETTER, version: 1 };
    build(context: PromptContext<{ text: string }>): PromptResult {
      const text = `Cover letter prompt for ${context.userId}: ${context.input.text}`;
      return {
        text,
        version: this.metadata.version,
        hash: PromptHash.generate(text),
        metadata: this.metadata,
      };
    }
  }

  class ThrowingPromptBuilder implements PromptBuilder {
    readonly metadata = { feature: AIFeature.CAREER_ADVISOR, version: 1 };
    build(): never {
      throw new Error('template rendering failed');
    }
  }

  class FailingTestProvider implements AIProvider {
    readonly name = FAILING_PROVIDER_NAME;

    async generate(_request: GenerateRequest): Promise<GenerateResult> {
      failingProviderCallCount += 1;
      throw new ProviderUnavailableError(FAILING_PROVIDER_NAME);
    }

    async *stream(): AsyncIterable<StreamChunk> {
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
        model: 'test-model',
        estimatedCost: 0,
        currency: 'USD',
        tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      };
    }

    supportedModels(): string[] {
      return ['test-model'];
    }
  }

  beforeAll(async () => {
    throttlerSpy = disableThrottlingForTests();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
    prisma = moduleRef.get(PrismaService);
    creditService = moduleRef.get(CreditService);
    orchestrationService = moduleRef.get(AiOrchestrationService);
    promptRegistry = moduleRef.get(PromptRegistry);
    const providerRegistry = moduleRef.get(ProviderRegistry);

    promptRegistry.register(new TestCoverLetterPromptBuilder());
    promptRegistry.register(new ThrowingPromptBuilder());
    providerRegistry.register(new FailingTestProvider());

    await prisma.featurePricing.createMany({
      data: [
        { featureKey: AIFeature.COVER_LETTER, cost: 30, active: true },
        { featureKey: AIFeature.CAREER_ADVISOR, cost: 15, active: true },
      ],
    });
  });

  afterAll(async () => {
    try {
      const testUsers = await prisma.user.findMany({
        where: { email: { contains: `ai-orch-e2e-${testRunId}` } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);

      if (userIds.length > 0) {
        await prisma.$transaction([
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
        where: { featureKey: { in: [AIFeature.COVER_LETTER, AIFeature.CAREER_ADVISOR] } },
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

  async function grantCredits(userId: string, amount: number, label: string): Promise<void> {
    await creditService.adjustBalance(userId, {
      userId,
      amount,
      type: 'ADMIN_ADJUSTMENT',
      reason: 'Test fixture setup',
      idempotencyKey: `${label}-grant-${randomUUID()}`,
    });
  }

  it('runs the full pipeline against a real provider and charges credits exactly once', async () => {
    const { userId } = await registerAndLogin('happy-path');
    await grantCredits(userId, 100, 'happy-path');

    const result = await orchestrationService.execute({
      userId,
      feature: AIFeature.COVER_LETTER,
      input: { text: 'Software engineer, 5 years experience.' },
      idempotencyKey: `happy-path-${randomUUID()}`,
    });

    expect(result.provider).toBe('dummy');
    expect(result.creditsCharged).toBe(30);
    expect(result.cached).toBe(false);
    expect(result.text.length).toBeGreaterThan(0);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
    expect(wallet?.availableCredits).toBe(70);

    const aiRequest = await prisma.aiRequest.findUnique({ where: { id: result.aiRequestId } });
    expect(aiRequest).toMatchObject({
      status: 'SUCCEEDED',
      feature: AIFeature.COVER_LETTER,
      provider: 'dummy',
      promptHash: result.promptHash,
      promptVersion: 1,
      creditsCharged: 30,
      creditsRefunded: 0,
    });
    expect(aiRequest?.durationMs).toBeGreaterThanOrEqual(0);

    const transactions = await prisma.creditTransaction.findMany({
      where: { userId, type: 'CONSUMPTION' },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.amount).toBe(-30);
  });

  it('honors an explicit preferredModel option end-to-end', async () => {
    const { userId } = await registerAndLogin('preferred-model');
    await grantCredits(userId, 100, 'preferred-model');

    const result = await orchestrationService.execute({
      userId,
      feature: AIFeature.COVER_LETTER,
      input: { text: 'x' },
      idempotencyKey: `preferred-model-${randomUUID()}`,
      options: { preferredModel: 'dummy-v1-fast' },
    });

    expect(result.model).toBe('dummy-v1-fast');
  });

  it('throws InsufficientCreditsException and never touches the ledger or ai_requests when the balance is too low', async () => {
    const { userId } = await registerAndLogin('insufficient');

    await expect(
      orchestrationService.execute({
        userId,
        feature: AIFeature.COVER_LETTER,
        input: { text: 'x' },
        idempotencyKey: `insufficient-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditsException);

    const transactions = await prisma.creditTransaction.findMany({ where: { userId } });
    expect(transactions).toHaveLength(0);
    const aiRequests = await prisma.aiRequest.findMany({ where: { userId } });
    expect(aiRequests).toHaveLength(0);
  });

  it('throws PromptBuilderNotFoundError for an unimplemented feature, before any credit is charged', async () => {
    const { userId } = await registerAndLogin('unimplemented-feature');
    await grantCredits(userId, 100, 'unimplemented-feature');

    await expect(
      orchestrationService.execute({
        userId,
        feature: AIFeature.INTERVIEW,
        input: {},
        idempotencyKey: `unimplemented-${randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(PromptBuilderNotFoundError);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
    expect(wallet?.availableCredits).toBe(100); // untouched
  });

  it('automatically refunds when Build Prompt fails, even though no ai_requests row exists for the attempt', async () => {
    const { userId } = await registerAndLogin('build-prompt-fails');
    await grantCredits(userId, 100, 'build-prompt-fails');

    await expect(
      orchestrationService.execute({
        userId,
        feature: AIFeature.CAREER_ADVISOR,
        input: {},
        idempotencyKey: `build-fails-${randomUUID()}`,
      }),
    ).rejects.toThrow('template rendering failed');

    const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
    expect(wallet?.availableCredits).toBe(100); // fully restored by the automatic refund

    const transactions = await prisma.creditTransaction.findMany({
      where: { userId, type: { in: ['CONSUMPTION', 'REFUND'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(transactions.map((t) => t.type)).toEqual(['CONSUMPTION', 'REFUND']);

    const aiRequests = await prisma.aiRequest.findMany({ where: { userId } });
    expect(aiRequests).toHaveLength(0); // never reached the "Store AI Request" step
  });

  it('retries a retryable provider failure per the retry policy, then fails permanently with a refund and a FAILED ai_requests row', async () => {
    const { userId } = await registerAndLogin('provider-fails');
    await grantCredits(userId, 100, 'provider-fails');
    failingProviderCallCount = 0;

    await expect(
      orchestrationService.execute({
        userId,
        feature: AIFeature.COVER_LETTER,
        input: { text: 'x' },
        idempotencyKey: `provider-fails-${randomUUID()}`,
        options: {
          preferredProvider: FAILING_PROVIDER_NAME,
          preferredModel: 'test-model',
          retryPolicy: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 5, backoff: 'fixed' },
        },
      }),
    ).rejects.toBeInstanceOf(RetryLimitExceededError);

    expect(failingProviderCallCount).toBe(2); // exactly maxAttempts

    const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
    expect(wallet?.availableCredits).toBe(100); // fully restored

    const aiRequests = await prisma.aiRequest.findMany({ where: { userId } });
    expect(aiRequests).toHaveLength(1);
    expect(aiRequests[0]).toMatchObject({
      status: 'FAILED',
      provider: FAILING_PROVIDER_NAME,
      creditsCharged: 30,
      creditsRefunded: 30,
      errorCode: 'AI_RETRY_LIMIT_EXCEEDED',
    });
    // Net-zero economic effect for the user: charged 30 and refunded 30 —
    // this row exists to explain the ledger pair below, not to imply a loss.

    const transactions = await prisma.creditTransaction.findMany({
      where: { userId, type: { in: ['CONSUMPTION', 'REFUND'] } },
      orderBy: { createdAt: 'asc' },
    });
    expect(transactions.map((t) => t.type)).toEqual(['CONSUMPTION', 'REFUND']);
  });

  it('is idempotent on the credit ledger — the same idempotencyKey never double-charges even if replayed', async () => {
    const { userId } = await registerAndLogin('idempotent');
    await grantCredits(userId, 100, 'idempotent');
    const idempotencyKey = `idempotent-${randomUUID()}`;

    const first = await orchestrationService.execute({
      userId,
      feature: AIFeature.COVER_LETTER,
      input: { text: 'x' },
      idempotencyKey,
    });
    const second = await orchestrationService.execute({
      userId,
      feature: AIFeature.COVER_LETTER,
      input: { text: 'x' },
      idempotencyKey,
    });

    expect(second.aiRequestId).toBe(first.aiRequestId);

    const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
    expect(wallet?.availableCredits).toBe(70); // charged exactly once, not twice

    const transactions = await prisma.creditTransaction.findMany({
      where: { userId, type: 'CONSUMPTION' },
    });
    expect(transactions).toHaveLength(1);
  });
});
