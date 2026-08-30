export type BackoffStrategy = 'fixed' | 'exponential';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoff: BackoffStrategy;
}

/** Used whenever an execution doesn't supply its own AIExecutionOptions.retryPolicy. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  backoff: 'exponential',
};
