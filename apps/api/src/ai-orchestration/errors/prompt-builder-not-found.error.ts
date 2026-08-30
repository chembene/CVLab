import { HttpStatus } from '@nestjs/common';
import { AIError } from './ai-error';

/** Thrown by PromptRegistry.resolve() (and checked eagerly by AiOrchestrationService during "Validate Request", before any credit is charged) when no PromptBuilder is registered for the requested feature — e.g. calling execute() for a feature phase that hasn't shipped yet. A configuration/deployment gap, not a user-input error — 500, not 422. Not retryable — the registration state won't change mid-request. */
export class PromptBuilderNotFoundError extends AIError {
  readonly code = 'AI_PROMPT_BUILDER_NOT_FOUND';
  readonly retryable = false;

  constructor(feature: string) {
    super(
      `No PromptBuilder is registered for feature "${feature}".`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
