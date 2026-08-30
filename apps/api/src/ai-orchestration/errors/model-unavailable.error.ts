import { HttpStatus } from '@nestjs/common';
import { AIError } from './ai-error';

/** Thrown by ModelSelector when the requested model isn't in the provider's supportedModels() list, or the provider supports zero models. Not retryable — the model won't suddenly appear on retry; the caller must pick a different model. */
export class ModelUnavailableError extends AIError {
  readonly code = 'AI_MODEL_UNAVAILABLE';
  readonly retryable = false;

  constructor(model: string, providerName: string) {
    super(
      `Model "${model}" is not available on provider "${providerName}".`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
