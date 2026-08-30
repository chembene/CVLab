/**
 * Cache abstraction only — per this phase's brief, no Redis (or any other)
 * implementation is built yet. NoopAiCacheService (../cache/) is registered
 * behind AI_CACHE_SERVICE today so the DI graph is complete and a future
 * Redis-backed implementation is a one-line `useClass` swap, mirroring the
 * BillingProvider/BILLING_PROVIDER pattern from Phase 5. Not yet called by
 * AiOrchestrationService's pipeline — see
 * docs/architecture/ai-orchestration.md "Cache" for why and where a future
 * phase would wire it in.
 */
export interface AICacheService {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** DI injection token — inject `@Inject(AI_CACHE_SERVICE)`, never import a concrete cache implementation directly. */
export const AI_CACHE_SERVICE = Symbol('AI_CACHE_SERVICE');

/** Deterministic key derivation so identical (feature, provider, model, prompt) tuples always produce the same cache key. */
export class AICacheKeyBuilder {
  static build(feature: string, provider: string, model: string, promptHash: string): string {
    return `ai:${feature}:${provider}:${model}:${promptHash}`;
  }
}
