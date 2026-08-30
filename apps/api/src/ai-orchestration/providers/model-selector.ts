import { Injectable } from '@nestjs/common';
import { ModelUnavailableError } from '../errors/model-unavailable.error';
import type { AIProvider } from '../interfaces/ai-provider.interface';

export interface ModelSelectionCriteria {
  preferredModel?: string;
}

/** Picks a model from whichever AIProvider ProviderSelector already chose. Defaults to the provider's first supportedModels() entry when no preference is given. */
@Injectable()
export class ModelSelector {
  select(provider: AIProvider, criteria: ModelSelectionCriteria = {}): string {
    const models = provider.supportedModels();
    const [defaultModel] = models;
    if (!defaultModel) {
      throw new ModelUnavailableError('(none configured)', provider.name);
    }
    if (!criteria.preferredModel) {
      return defaultModel;
    }
    if (!models.includes(criteria.preferredModel)) {
      throw new ModelUnavailableError(criteria.preferredModel, provider.name);
    }
    return criteria.preferredModel;
  }
}
