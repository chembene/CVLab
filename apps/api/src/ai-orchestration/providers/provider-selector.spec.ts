import { ProviderUnavailableError } from '../errors/provider-unavailable.error';
import type { AIProvider } from '../interfaces/ai-provider.interface';
import { ProviderRegistry } from './provider-registry';
import { DEFAULT_PROVIDER_NAME, ProviderSelector } from './provider-selector';

function fakeProvider(name: string): AIProvider {
  return {
    name,
    generate: jest.fn(),
    stream: jest.fn(),
    health: jest.fn(),
    countTokens: jest.fn(),
    estimateCost: jest.fn(),
    supportedModels: jest.fn().mockReturnValue([]),
  };
}

describe('ProviderSelector', () => {
  it('selects the default provider ("dummy") when no preference is given', () => {
    const registry = new ProviderRegistry();
    const dummy = fakeProvider(DEFAULT_PROVIDER_NAME);
    registry.register(dummy);
    const selector = new ProviderSelector(registry);

    expect(selector.select()).toBe(dummy);
    expect(selector.select({})).toBe(dummy);
  });

  it('selects a specific provider when preferredProvider is given', () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider(DEFAULT_PROVIDER_NAME));
    const openai = fakeProvider('openai');
    registry.register(openai);
    const selector = new ProviderSelector(registry);

    expect(selector.select({ preferredProvider: 'openai' })).toBe(openai);
  });

  it('throws ProviderUnavailableError when the requested provider is not registered', () => {
    const registry = new ProviderRegistry();
    const selector = new ProviderSelector(registry);

    expect(() => selector.select({ preferredProvider: 'openai' })).toThrow(
      ProviderUnavailableError,
    );
  });

  it('throws ProviderUnavailableError when no provider at all is registered', () => {
    const registry = new ProviderRegistry();
    const selector = new ProviderSelector(registry);

    expect(() => selector.select()).toThrow(ProviderUnavailableError);
  });
});
