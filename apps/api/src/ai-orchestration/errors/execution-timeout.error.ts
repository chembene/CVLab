import { HttpStatus } from '@nestjs/common';
import { AIError } from './ai-error';

/** Thrown when a provider call exceeds AIExecutionOptions.timeoutMs. Retryable — a timeout is typically transient load/latency, not a structural failure. */
export class ExecutionTimeoutError extends AIError {
  readonly code = 'AI_EXECUTION_TIMEOUT';
  readonly retryable = true;

  constructor(timeoutMs: number) {
    super(`AI provider execution exceeded the ${timeoutMs}ms timeout.`, HttpStatus.GATEWAY_TIMEOUT);
  }
}
