import { ModelUnavailableError } from '../errors/model-unavailable.error';
import type { AIProvider } from '../interfaces/ai-provider.interface';
import { ModelSelector } from './model-selector';

function fakeProvider(models: string[]): AIProvider {
  return {
    name: 'dummy',
    generate: jest.fn(),
    stream: jest.fn(),
    health: jest.fn(),
    countTokens: jest.fn(),
    estimateCost: jest.fn(),
    supportedModels: jest.fn().mockReturnValue(models),
  };
}

describe('ModelSelector', () => {
  const selector = new ModelSelector();

  it('returns the provider’s first supported model when no preference is given', () => {
    const provider = fakeProvider(['dummy-v1', 'dummy-v1-fast']);
    expect(selector.select(provider)).toBe('dummy-v1');
    expect(selector.select(provider, {})).toBe('dummy-v1');
  });

  it('returns the preferred model when it is supported by the provider', () => {
    const provider = fakeProvider(['dummy-v1', 'dummy-v1-fast']);
    expect(selector.select(provider, { preferredModel: 'dummy-v1-fast' })).toBe('dummy-v1-fast');
  });

  it('throws ModelUnavailableError when the preferred model is not supported', () => {
    const provider = fakeProvider(['dummy-v1']);
    expect(() => selector.select(provider, { preferredModel: 'gpt-5' })).toThrow(
      ModelUnavailableError,
    );
  });

  it('throws ModelUnavailableError when the provider supports zero models', () => {
    const provider = fakeProvider([]);
    expect(() => selector.select(provider)).toThrow(ModelUnavailableError);
  });
});
