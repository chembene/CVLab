import { Injectable } from '@nestjs/common';
import type { AIFeature } from '../constants/ai-feature.enum';
import { PromptBuilderNotFoundError } from '../errors/prompt-builder-not-found.error';
import { PromptBuilder } from '../interfaces/prompt.interface';

/**
 * Resolves the PromptBuilder for a given AIFeature. Empty until a feature
 * module registers its own builder in its `onModuleInit()` — see
 * ResumeOptimizationModule (Phase 7) for the first example. Cover Letter,
 * Interview, Career Advisor (FASE 18), LinkedIn (FASE 19), and ATS AI
 * (FASE 20) now register theirs the same way; Template Recommendation
 * still stays unregistered until its own phase ships.
 * AiOrchestrationService checks `has()` during its "Validate Request" step,
 * before any credit is charged, so calling execute() for an unimplemented
 * feature fails fast and free.
 */
@Injectable()
export class PromptRegistry {
  private readonly builders = new Map<AIFeature, PromptBuilder>();

  register(builder: PromptBuilder): void {
    this.builders.set(builder.metadata.feature, builder);
  }

  resolve(feature: AIFeature): PromptBuilder {
    const builder = this.builders.get(feature);
    if (!builder) {
      throw new PromptBuilderNotFoundError(feature);
    }
    return builder;
  }

  has(feature: AIFeature): boolean {
    return this.builders.has(feature);
  }

  registeredFeatures(): AIFeature[] {
    return Array.from(this.builders.keys());
  }
}
