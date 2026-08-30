import { Module, OnModuleInit } from '@nestjs/common';
import { CreditsModule } from '../credits/credits.module';
import { AiRequestTrackingModule } from '../ai-request-tracking/ai-request-tracking.module';
import { AI_CACHE_SERVICE } from './interfaces/ai-cache.interface';
import { NoopAiCacheService } from './cache/noop-ai-cache.service';
import { PromptRegistry } from './prompt/prompt-registry';
import { ProviderRegistry } from './providers/provider-registry';
import { ProviderSelector } from './providers/provider-selector';
import { ModelSelector } from './providers/model-selector';
import { DummyAIProvider } from './providers/dummy-ai-provider';
import { RetryExecutor } from './retry/retry-executor';
import { AiOrchestrationService } from './pipeline/ai-orchestration.service';

/**
 * The AI Orchestration Engine, per docs/architecture/ai-orchestration.md.
 * No AI feature is implemented here — this module ships only the pipeline
 * every feature depends on, plus DummyAIProvider as the sole registered
 * provider. Registers DummyAIProvider into ProviderRegistry on boot;
 * PromptRegistry itself stays empty here — each feature module (e.g.
 * ResumeOptimizationModule, Phase 7) registers its own PromptBuilder into it
 * on that module's own `onModuleInit()`.
 */
@Module({
  imports: [CreditsModule, AiRequestTrackingModule],
  providers: [
    PromptRegistry,
    ProviderRegistry,
    ProviderSelector,
    ModelSelector,
    RetryExecutor,
    DummyAIProvider,
    { provide: AI_CACHE_SERVICE, useClass: NoopAiCacheService },
    AiOrchestrationService,
  ],
  exports: [
    AiOrchestrationService,
    PromptRegistry,
    ProviderRegistry,
    ProviderSelector,
    ModelSelector,
    AI_CACHE_SERVICE,
  ],
})
export class AiOrchestrationModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: ProviderRegistry,
    private readonly dummyProvider: DummyAIProvider,
  ) {}

  onModuleInit(): void {
    this.providerRegistry.register(this.dummyProvider);
  }
}
