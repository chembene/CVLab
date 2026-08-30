import { AIFeature } from '../constants/ai-feature.enum';
import { InsufficientCreditsException } from '../../credits/errors/insufficient-credits.exception';
import { InvalidPromptError } from '../errors/invalid-prompt.error';
import { PromptBuilderNotFoundError } from '../errors/prompt-builder-not-found.error';
import type { AIProvider, GenerateResult } from '../interfaces/ai-provider.interface';
import type { PromptBuilder, PromptResult } from '../interfaces/prompt.interface';
import type { PromptRegistry } from '../prompt/prompt-registry';
import type { ProviderSelector } from '../providers/provider-selector';
import type { ModelSelector } from '../providers/model-selector';
import type { RetryExecutor } from '../retry/retry-executor';
import type { CreditService } from '../../credits/credit.service';
import type { AiRequestTrackingService } from '../../ai-request-tracking/ai-request-tracking.service';
import { AiOrchestrationService } from './ai-orchestration.service';

describe('AiOrchestrationService', () => {
  let promptRegistry: jest.Mocked<PromptRegistry>;
  let providerSelector: jest.Mocked<ProviderSelector>;
  let modelSelector: jest.Mocked<ModelSelector>;
  let retryExecutor: jest.Mocked<RetryExecutor>;
  let creditService: jest.Mocked<CreditService>;
  let aiRequestTracking: jest.Mocked<AiRequestTrackingService>;
  let service: AiOrchestrationService;

  let builder: jest.Mocked<PromptBuilder>;
  let provider: jest.Mocked<AIProvider>;

  const promptResult: PromptResult = {
    text: 'Rendered prompt text',
    version: 1,
    hash: 'hash-abc',
    metadata: { feature: AIFeature.COVER_LETTER, version: 1 },
  };

  const generateResult: GenerateResult = {
    text: 'Generated response text',
    provider: 'dummy',
    model: 'dummy-v1',
    tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    finishReason: 'stop',
    requestId: 'req-1',
  };

  beforeEach(() => {
    builder = {
      metadata: promptResult.metadata,
      build: jest.fn().mockResolvedValue(promptResult),
    } as never;

    provider = {
      name: 'dummy',
      generate: jest.fn().mockResolvedValue(generateResult),
      stream: jest.fn(),
      health: jest.fn(),
      countTokens: jest.fn(),
      estimateCost: jest.fn().mockResolvedValue({
        provider: 'dummy',
        model: 'dummy-v1',
        estimatedCost: 0.001,
        currency: 'USD',
        tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
      supportedModels: jest.fn().mockReturnValue(['dummy-v1']),
    } as never;

    promptRegistry = {
      resolve: jest.fn().mockReturnValue(builder),
      has: jest.fn(),
      register: jest.fn(),
    } as never;
    providerSelector = { select: jest.fn().mockReturnValue(provider) } as never;
    modelSelector = { select: jest.fn().mockReturnValue('dummy-v1') } as never;
    retryExecutor = { execute: jest.fn((fn: () => Promise<unknown>) => fn()) } as never;

    creditService = {
      estimate: jest.fn().mockResolvedValue({
        featureKey: AIFeature.COVER_LETTER,
        cost: 30,
        currentBalance: 100,
        sufficientBalance: true,
        balanceAfter: 70,
      }),
      spendAndExecute: jest.fn((_userId: string, _params: unknown, work: () => Promise<unknown>) =>
        work(),
      ),
    } as never;

    aiRequestTracking = {
      start: jest.fn().mockResolvedValue({ id: 'ai-request-1' }),
      complete: jest.fn().mockResolvedValue({}),
      fail: jest.fn().mockResolvedValue({}),
      recordRefund: jest.fn().mockResolvedValue({}),
    } as never;

    service = new AiOrchestrationService(
      promptRegistry,
      providerSelector,
      modelSelector,
      retryExecutor,
      creditService,
      aiRequestTracking,
    );
  });

  const baseRequest = {
    userId: 'user-1',
    feature: AIFeature.COVER_LETTER,
    input: { some: 'input' },
    idempotencyKey: 'key-1',
  };

  it('runs the full pipeline in order and returns the execution result', async () => {
    const result = await service.execute(baseRequest);

    expect(result).toMatchObject({
      aiRequestId: 'ai-request-1',
      feature: AIFeature.COVER_LETTER,
      provider: 'dummy',
      model: 'dummy-v1',
      text: generateResult.text,
      creditsCharged: 30,
      promptVersion: 1,
      promptHash: 'hash-abc',
      cached: false,
    });

    // Validate Request → (implicit) → Credit Check → Charge Credits → Build
    // Prompt → Select Provider → Select Model → Execute Provider → Store AI
    // Request → Return Result, per docs/architecture/ai-orchestration.md.
    const order = [
      creditService.estimate.mock.invocationCallOrder[0]!,
      creditService.spendAndExecute.mock.invocationCallOrder[0]!,
      builder.build.mock.invocationCallOrder[0]!,
      providerSelector.select.mock.invocationCallOrder[0]!,
      modelSelector.select.mock.invocationCallOrder[0]!,
      retryExecutor.execute.mock.invocationCallOrder[0]!,
      aiRequestTracking.complete.mock.invocationCallOrder[0]!,
    ];
    expect(order).toEqual([...order].sort((a, b) => a - b));

    expect(aiRequestTracking.start).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        feature: AIFeature.COVER_LETTER,
        provider: 'dummy',
        model: 'dummy-v1',
        promptHash: 'hash-abc',
        promptVersion: 1,
      }),
    );
    expect(aiRequestTracking.fail).not.toHaveBeenCalled();
    expect(aiRequestTracking.recordRefund).not.toHaveBeenCalled();
  });

  it('rejects with InsufficientCreditsException and never charges when the balance is too low', async () => {
    creditService.estimate.mockResolvedValue({
      featureKey: AIFeature.COVER_LETTER,
      cost: 30,
      currentBalance: 10,
      sufficientBalance: false,
      balanceAfter: -20,
    });

    await expect(service.execute(baseRequest)).rejects.toBeInstanceOf(InsufficientCreditsException);
    expect(creditService.spendAndExecute).not.toHaveBeenCalled();
  });

  it('rejects with PromptBuilderNotFoundError before any credit check for an unregistered feature', async () => {
    promptRegistry.resolve.mockImplementation(() => {
      throw new PromptBuilderNotFoundError(AIFeature.INTERVIEW);
    });

    await expect(
      service.execute({ ...baseRequest, feature: AIFeature.INTERVIEW }),
    ).rejects.toBeInstanceOf(PromptBuilderNotFoundError);
    expect(creditService.estimate).not.toHaveBeenCalled();
    expect(creditService.spendAndExecute).not.toHaveBeenCalled();
  });

  it('rejects with InvalidPromptError for a missing userId, before any credit check', async () => {
    await expect(service.execute({ ...baseRequest, userId: '' })).rejects.toBeInstanceOf(
      InvalidPromptError,
    );
    expect(creditService.estimate).not.toHaveBeenCalled();
  });

  it('on provider execution failure: records the failure and reflects the automatic refund on the ai_requests row', async () => {
    const providerError = new Error('provider exploded');
    retryExecutor.execute.mockRejectedValue(providerError);

    await expect(service.execute(baseRequest)).rejects.toThrow('provider exploded');

    expect(aiRequestTracking.fail).toHaveBeenCalledWith(
      'ai-request-1',
      expect.objectContaining({ errorCode: 'AI_UNKNOWN_ERROR' }),
    );
    expect(aiRequestTracking.recordRefund).toHaveBeenCalledWith('ai-request-1', 30);
    expect(aiRequestTracking.complete).not.toHaveBeenCalled();
  });

  it('on an empty provider response: raises InvalidPromptError and still records failure + refund', async () => {
    retryExecutor.execute.mockResolvedValue({ ...generateResult, text: '   ' });

    await expect(service.execute(baseRequest)).rejects.toBeInstanceOf(InvalidPromptError);

    expect(aiRequestTracking.fail).toHaveBeenCalledWith(
      'ai-request-1',
      expect.objectContaining({ errorCode: 'AI_INVALID_PROMPT' }),
    );
    expect(aiRequestTracking.recordRefund).toHaveBeenCalledWith('ai-request-1', 30);
  });

  it('does not record a refund when the failure happens before an ai_requests row exists (e.g. build prompt fails)', async () => {
    const buildError = new Error('template rendering failed');
    builder.build.mockRejectedValue(buildError);

    await expect(service.execute(baseRequest)).rejects.toThrow('template rendering failed');

    expect(aiRequestTracking.start).not.toHaveBeenCalled();
    expect(aiRequestTracking.recordRefund).not.toHaveBeenCalled();
  });

  it('forwards responseFormat to the provider and runs a caller-supplied responseValidator during Validate Response', async () => {
    const validator = jest.fn();

    await service.execute({
      ...baseRequest,
      options: { responseFormat: 'json', responseValidator: validator },
    });

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ responseFormat: 'json' }),
    );
    expect(provider.estimateCost).toHaveBeenCalledWith(
      expect.objectContaining({ responseFormat: 'json' }),
    );
    expect(validator).toHaveBeenCalledWith(generateResult);
    expect(validator.mock.invocationCallOrder[0]!).toBeGreaterThan(
      retryExecutor.execute.mock.invocationCallOrder[0]!,
    );
  });

  it('a responseValidator that throws fails the pipeline exactly like any other Validate Response failure', async () => {
    const validationError = new InvalidPromptError('bad JSON shape');
    const validator = jest.fn(() => {
      throw validationError;
    });

    await expect(
      service.execute({
        ...baseRequest,
        options: { responseFormat: 'json', responseValidator: validator },
      }),
    ).rejects.toBe(validationError);

    expect(aiRequestTracking.fail).toHaveBeenCalledWith(
      'ai-request-1',
      expect.objectContaining({ errorCode: 'AI_INVALID_PROMPT' }),
    );
    expect(aiRequestTracking.recordRefund).toHaveBeenCalledWith('ai-request-1', 30);
    expect(aiRequestTracking.complete).not.toHaveBeenCalled();
  });
});
