import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { CreditService } from '../../credits/credit.service';
import { InsufficientCreditsException } from '../../credits/errors/insufficient-credits.exception';
import { AiRequestTrackingService } from '../../ai-request-tracking/ai-request-tracking.service';
import { AIError } from '../errors/ai-error';
import { InvalidPromptError } from '../errors/invalid-prompt.error';
import type { AIExecutionContext } from '../interfaces/ai-execution-context.interface';
import type { AIExecutionResult } from '../interfaces/ai-execution-result.interface';
import type { ExecuteAIRequestInput } from '../interfaces/execute-request.interface';
import type { GenerateResult } from '../interfaces/ai-provider.interface';
import { DEFAULT_RETRY_POLICY } from '../interfaces/retry-policy.interface';
import { PromptRegistry } from '../prompt/prompt-registry';
import { ProviderSelector } from '../providers/provider-selector';
import { ModelSelector } from '../providers/model-selector';
import { RetryExecutor } from '../retry/retry-executor';

/**
 * The single execution pipeline every AI feature must go through — per
 * docs/architecture/ai-orchestration.md "Execution Pipeline", no feature is
 * ever allowed to call a provider or the credit ledger directly. Runs, in
 * this exact order:
 *
 *   1. Validate Request     — validateRequest()
 *   2. Load Context         — loadContext()
 *   3. Credit Check         — CreditService.estimate()
 *   4. Charge Credits       — CreditService.spendAndExecute() opens here
 *   5. Build Prompt         — PromptRegistry.resolve().build()
 *   6. Select Provider      — ProviderSelector.select()
 *   7. Select Model         — ModelSelector.select()
 *   8. Execute Provider     — RetryExecutor.execute(provider.generate)
 *   9. Validate Response    — validateResponse()
 *  10. Store AI Request     — AiRequestTrackingService.complete()/fail()
 *  11. Return Result        — spendAndExecute() resolves with the result
 *
 * Steps 4-10 live inside CreditService.spendAndExecute()'s `work` callback:
 * that method is Phase 5's concrete RESERVE→PROCESS→COMMIT/RELEASE
 * implementation (charge, run work, auto-refund on any thrown error), so
 * steps 5-10 automatically inherit "automatic refund + record failure" for
 * free rather than this service re-implementing that bookkeeping. Step 3
 * (a cheap, non-mutating balance peek) happens before spendAndExecute() so
 * a request that can't possibly afford the feature never touches the ledger
 * at all — no reservation is created for it, per
 * docs/architecture/credit-architecture.md §4 step 1.
 */
@Injectable()
export class AiOrchestrationService {
  constructor(
    private readonly promptRegistry: PromptRegistry,
    private readonly providerSelector: ProviderSelector,
    private readonly modelSelector: ModelSelector,
    private readonly retryExecutor: RetryExecutor,
    private readonly creditService: CreditService,
    private readonly aiRequestTracking: AiRequestTrackingService,
  ) {}

  async execute<TInput = unknown>(
    request: ExecuteAIRequestInput<TInput>,
  ): Promise<AIExecutionResult> {
    // 1. Validate Request — including that a PromptBuilder even exists for
    // this feature, so an unimplemented feature never reaches credit
    // charging in the first place.
    this.validateRequest(request);

    // 2. Load Context
    const context = this.loadContext(request);

    // 3. Credit Check — read-only; does not reserve or mutate the wallet.
    const estimate = await this.creditService.estimate(context.userId, context.feature);
    if (!estimate.sufficientBalance) {
      throw new InsufficientCreditsException(
        `Insufficient credits for feature "${context.feature}".`,
      );
    }

    const startedAt = Date.now();
    let aiRequestId: string | undefined;

    try {
      // 4. Charge Credits, running steps 5-10 as the guarded work.
      return await this.creditService.spendAndExecute(
        context.userId,
        {
          amount: estimate.cost,
          reference: context.correlationId,
          description: `AI feature: ${context.feature}`,
          idempotencyKey: context.idempotencyKey,
          metadata: { feature: context.feature, correlationId: context.correlationId },
        },
        async () => {
          // 5. Build Prompt
          const builder = this.promptRegistry.resolve(context.feature);
          const promptResult = await builder.build({
            userId: context.userId,
            locale: context.locale,
            input: request.input,
          });

          // 6. Select Provider
          const provider = this.providerSelector.select({
            preferredProvider: request.options?.preferredProvider,
          });

          // 7. Select Model
          const model = this.modelSelector.select(provider, {
            preferredModel: request.options?.preferredModel,
          });

          const costEstimate = await provider.estimateCost({
            prompt: promptResult.text,
            model,
            maxTokens: request.options?.maxTokens,
            responseFormat: request.options?.responseFormat,
          });

          const aiRequest = await this.aiRequestTracking.start(context.userId, {
            feature: context.feature,
            provider: provider.name,
            model,
            promptHash: promptResult.hash,
            promptVersion: promptResult.version,
            idempotencyKey: context.idempotencyKey,
            metadata: { correlationId: context.correlationId },
          });
          aiRequestId = aiRequest.id;

          try {
            // 8. Execute Provider, under the configured retry policy.
            const retryPolicy = request.options?.retryPolicy ?? DEFAULT_RETRY_POLICY;
            const generateResult = await this.retryExecutor.execute(
              () =>
                provider.generate({
                  prompt: promptResult.text,
                  model,
                  maxTokens: request.options?.maxTokens,
                  temperature: request.options?.temperature,
                  responseFormat: request.options?.responseFormat,
                }),
              retryPolicy,
            );

            // 9. Validate Response — the built-in empty-text check, then an
            // optional feature-specific contract check (e.g. JSON shape).
            this.validateResponse(generateResult);
            request.options?.responseValidator?.(generateResult);

            const durationMs = Date.now() - startedAt;

            // 10. Store AI Request (finalize the row created above)
            await this.aiRequestTracking.complete(aiRequest.id, {
              requestId: generateResult.requestId,
              inputTokens: generateResult.tokenUsage.inputTokens,
              outputTokens: generateResult.tokenUsage.outputTokens,
              totalTokens: generateResult.tokenUsage.totalTokens,
              estimatedCost: costEstimate.estimatedCost,
              creditsCharged: estimate.cost,
              durationMs,
            });

            // 11. Return Result
            const result: AIExecutionResult = {
              aiRequestId: aiRequest.id,
              feature: context.feature,
              provider: provider.name,
              model,
              text: generateResult.text,
              tokenUsage: generateResult.tokenUsage,
              estimatedCost: costEstimate.estimatedCost,
              creditsCharged: estimate.cost,
              promptVersion: promptResult.version,
              promptHash: promptResult.hash,
              durationMs,
              cached: false,
            };
            return result;
          } catch (error) {
            const durationMs = Date.now() - startedAt;
            await this.aiRequestTracking.fail(aiRequest.id, {
              errorCode: this.errorCodeOf(error),
              durationMs,
              creditsCharged: estimate.cost,
            });
            throw error;
          }
        },
      );
    } catch (error) {
      // spendAndExecute() has already auto-refunded the charge by the time
      // this catch runs (or never charged at all, if the failure happened
      // before step 4). Only reflect the refund on the ai_requests row when
      // one was actually created for this attempt.
      if (aiRequestId) {
        await this.aiRequestTracking.recordRefund(aiRequestId, estimate.cost);
      }
      throw error;
    }
  }

  private validateRequest(request: ExecuteAIRequestInput): void {
    if (!request.userId) {
      throw new InvalidPromptError('userId is required.');
    }
    if (!request.feature) {
      throw new InvalidPromptError('feature is required.');
    }
    if (!request.idempotencyKey) {
      throw new InvalidPromptError('idempotencyKey is required.');
    }
    // Checked here, not at "Build Prompt", so an unimplemented feature never
    // reaches credit charging — see this class's top-level doc comment.
    this.promptRegistry.resolve(request.feature);
  }

  private loadContext(request: ExecuteAIRequestInput): AIExecutionContext {
    return {
      userId: request.userId,
      feature: request.feature,
      correlationId: randomUUID(),
      idempotencyKey: request.idempotencyKey,
      locale: request.locale,
    };
  }

  private validateResponse(result: GenerateResult): void {
    if (!result.text || result.text.trim().length === 0) {
      throw new InvalidPromptError('The AI provider returned an empty response.');
    }
  }

  private errorCodeOf(error: unknown): string {
    return error instanceof AIError ? error.code : 'AI_UNKNOWN_ERROR';
  }
}
