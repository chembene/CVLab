import { HttpStatus } from '@nestjs/common';
import { AIError } from './ai-error';

/** Thrown by RetryExecutor once a retryable error has recurred through every configured attempt. Terminal by definition — not retryable itself, or RetryExecutor would loop forever. Wraps the last underlying error as `cause` for debugging/logging without leaking it to the client message. */
export class RetryLimitExceededError extends AIError {
  readonly code = 'AI_RETRY_LIMIT_EXCEEDED';
  readonly retryable = false;

  constructor(attempts: number, sourceError?: unknown) {
    super(
      `AI provider execution failed after ${attempts} attempt(s).`,
      HttpStatus.BAD_GATEWAY,
      sourceError,
    );
  }
}
