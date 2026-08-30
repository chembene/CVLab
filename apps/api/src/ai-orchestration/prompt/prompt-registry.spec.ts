import { AIFeature } from '../constants/ai-feature.enum';
import { PromptBuilderNotFoundError } from '../errors/prompt-builder-not-found.error';
import type { PromptBuilder, PromptContext, PromptResult } from '../interfaces/prompt.interface';
import { PromptRegistry } from './prompt-registry';

class TestPromptBuilder implements PromptBuilder {
  readonly metadata = { feature: AIFeature.COVER_LETTER, version: 1 };
  build(context: PromptContext): PromptResult {
    return {
      text: `prompt for ${context.userId}`,
      version: 1,
      hash: 'hash',
      metadata: this.metadata,
    };
  }
}

describe('PromptRegistry', () => {
  it('starts empty — has() is false and resolve() throws for any feature', () => {
    const registry = new PromptRegistry();
    expect(registry.has(AIFeature.COVER_LETTER)).toBe(false);
    expect(() => registry.resolve(AIFeature.COVER_LETTER)).toThrow(PromptBuilderNotFoundError);
  });

  it('registers a builder keyed by its own metadata.feature and resolves it back', () => {
    const registry = new PromptRegistry();
    const builder = new TestPromptBuilder();

    registry.register(builder);

    expect(registry.has(AIFeature.COVER_LETTER)).toBe(true);
    expect(registry.resolve(AIFeature.COVER_LETTER)).toBe(builder);
    expect(registry.registeredFeatures()).toEqual([AIFeature.COVER_LETTER]);
  });

  it('resolve() throws PromptBuilderNotFoundError for an unregistered feature', () => {
    const registry = new PromptRegistry();
    registry.register(new TestPromptBuilder());

    expect(() => registry.resolve(AIFeature.INTERVIEW)).toThrow(PromptBuilderNotFoundError);
  });
});
