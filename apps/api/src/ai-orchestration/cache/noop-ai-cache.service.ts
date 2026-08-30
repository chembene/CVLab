import { Injectable } from '@nestjs/common';
import type { AICacheService } from '../interfaces/ai-cache.interface';

/** Placeholder AICacheService — always misses, never stores. Registered behind AI_CACHE_SERVICE so the DI graph is complete; a future Redis-backed implementation replaces this via a single `useClass` change (see AiOrchestrationModule). */
@Injectable()
export class NoopAiCacheService implements AICacheService {
  async get<T>(_key: string): Promise<T | null> {
    return null;
  }

  async set<T>(_key: string, _value: T, _ttlSeconds?: number): Promise<void> {
    // Intentionally a no-op — no cache backend exists yet.
  }

  async delete(_key: string): Promise<void> {
    // Intentionally a no-op — no cache backend exists yet.
  }
}
