import { HttpStatus } from '@nestjs/common';
import { AIError } from './ai-error';

/** Thrown when a prompt (or requested maxTokens) exceeds a model's context window. Not retryable — the same prompt will exceed the same limit every time; the caller must shorten the input or pick a larger-context model. */
export class TokenLimitExceededError extends AIError {
  readonly code = 'AI_TOKEN_LIMIT_EXCEEDED';
  readonly retryable = false;

  constructor(limit: number, actual: number) {
    super(
      `Token limit exceeded: ${actual} tokens requested, limit is ${limit}.`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
