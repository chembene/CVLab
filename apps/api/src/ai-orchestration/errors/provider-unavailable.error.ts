import { HttpStatus } from '@nestjs/common';
import { AIError } from './ai-error';

/** Thrown by ProviderSelector when the requested (or default) provider isn't registered, and by a provider's own health() failure path. Retryable — a provider being briefly unreachable is exactly the kind of transient failure retries exist for. */
export class ProviderUnavailableError extends AIError {
  readonly code = 'AI_PROVIDER_UNAVAILABLE';
  readonly retryable = true;

  constructor(providerName: string) {
    super(`AI provider unavailable: "${providerName}".`, HttpStatus.SERVICE_UNAVAILABLE);
  }
}
