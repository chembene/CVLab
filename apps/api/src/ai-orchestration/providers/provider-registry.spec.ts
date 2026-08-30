import type { AIProvider } from '../interfaces/ai-provider.interface';
import { ProviderRegistry } from './provider-registry';

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

describe('ProviderRegistry', () => {
  it('starts empty', () => {
    const registry = new ProviderRegistry();
    expect(registry.list()).toEqual([]);
    expect(registry.has('dummy')).toBe(false);
    expect(registry.get('dummy')).toBeUndefined();
  });

  it('registers a provider keyed by its own name and returns it via get()/list()/has()', () => {
    const registry = new ProviderRegistry();
    const provider = fakeProvider('dummy');

    registry.register(provider);

    expect(registry.get('dummy')).toBe(provider);
    expect(registry.has('dummy')).toBe(true);
    expect(registry.list()).toEqual([provider]);
  });

  it('registering a second provider with the same name replaces the first', () => {
    const registry = new ProviderRegistry();
    const first = fakeProvider('dummy');
    const second = fakeProvider('dummy');

    registry.register(first);
    registry.register(second);

    expect(registry.get('dummy')).toBe(second);
    expect(registry.list()).toHaveLength(1);
  });
});
