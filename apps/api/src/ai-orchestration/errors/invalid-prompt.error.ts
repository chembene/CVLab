import { HttpStatus } from '@nestjs/common';
import { AIError } from './ai-error';

/** Thrown for malformed execution requests and empty/invalid provider responses. Not retryable — retrying the same invalid input produces the same invalid result. */
export class InvalidPromptError extends AIError {
  readonly code = 'AI_INVALID_PROMPT';
  readonly retryable = false;

  constructor(reason: string) {
    super(`Invalid AI prompt or request: ${reason}`, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
