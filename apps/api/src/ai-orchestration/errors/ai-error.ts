import { HttpException } from '@nestjs/common';

/**
 * Base of the AI Orchestration error hierarchy. Extends HttpException (not a
 * plain Error) so that whichever future controller sits in front of
 * AiOrchestrationService — none exists yet, per this phase's scope — gets
 * correct HTTP status codes for free through AllExceptionsFilter, the same
 * pattern InsufficientCreditsException already established in the Credits
 * module. `code` is a stable, machine-readable identifier independent of the
 * HTTP status, used to populate `ai_requests.error_code` and for log
 * filtering. `retryable` is read directly by RetryExecutor — it is the
 * single source of truth for which failures are worth retrying, rather than
 * duplicating that decision in a separate retry-policy error list.
 */
export abstract class AIError extends HttpException {
  abstract readonly code: string;
  abstract readonly retryable: boolean;

  constructor(
    message: string,
    status: number,
    readonly sourceError?: unknown,
  ) {
    super(message, status);
    this.name = this.constructor.name;
  }
}
