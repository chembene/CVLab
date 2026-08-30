import { Injectable } from '@nestjs/common';
import { ProviderUnavailableError } from '../errors/provider-unavailable.error';
import type { AIProvider } from '../interfaces/ai-provider.interface';
import { ProviderRegistry } from './provider-registry';

/** Registry key of the provider used when no preferredProvider is given. Only "dummy" is registered in this phase — a future config-driven default (e.g. per-feature provider preference) can replace this constant without changing ProviderSelector's public shape. */
export const DEFAULT_PROVIDER_NAME = 'dummy';

export interface ProviderSelectionCriteria {
  preferredProvider?: string;
}

/** The orchestration pipeline's only path to an AIProvider instance — it asks ProviderSelector, never ProviderRegistry, directly. */
@Injectable()
export class ProviderSelector {
  constructor(private readonly registry: ProviderRegistry) {}

  select(criteria: ProviderSelectionCriteria = {}): AIProvider {
    const name = criteria.preferredProvider ?? DEFAULT_PROVIDER_NAME;
    const provider = this.registry.get(name);
    if (!provider) {
      throw new ProviderUnavailableError(name);
    }
    return provider;
  }
}
