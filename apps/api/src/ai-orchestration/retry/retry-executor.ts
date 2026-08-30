import { Injectable } from '@nestjs/common';
import { AIError } from '../errors/ai-error';
import { RetryLimitExceededError } from '../errors/retry-limit-exceeded.error';
import type { RetryPolicy } from '../interfaces/retry-policy.interface';

export type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wraps a single async operation (the "Execute Provider" pipeline step)
 * with configurable retry behavior. Retryability is decided by the error
 * itself (`AIError.retryable`), not by a separate class allow-list here —
 * a non-AIError (an unexpected bug) is never retried, and propagates
 * immediately. `sleep` is injectable purely for deterministic, fast unit
 * tests — production callers rely on the real timer default.
 */
@Injectable()
export class RetryExecutor {
  async execute<T>(
    fn: () => Promise<T>,
    policy: RetryPolicy,
    sleep: SleepFn = defaultSleep,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const retryable = error instanceof AIError && error.retryable;
        if (!retryable) {
          throw error;
        }
        if (attempt === policy.maxAttempts) {
          throw new RetryLimitExceededError(attempt, error);
        }
        await sleep(this.computeDelay(policy, attempt));
      }
    }

    // Unreachable — the loop above always returns or throws — but keeps
    // TypeScript's control-flow analysis satisfied without an `as` cast.
    throw new RetryLimitExceededError(policy.maxAttempts, lastError);
  }

  private computeDelay(policy: RetryPolicy, attempt: number): number {
    const raw =
      policy.backoff === 'exponential'
        ? policy.baseDelayMs * 2 ** (attempt - 1)
        : policy.baseDelayMs;
    return Math.min(raw, policy.maxDelayMs);
  }
}
