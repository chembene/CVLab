import type { AIFeature } from '../constants/ai-feature.enum';

/** A prompt template's revision number. A separate name (not a bare `number`) so signatures reading `version: PromptVersion` are self-documenting wherever this appears (PromptMetadata, PromptResult, ai_requests tracking). */
export type PromptVersion = number;

export interface PromptMetadata {
  feature: AIFeature;
  version: PromptVersion;
  description?: string;
}

/** Input handed to a PromptBuilder. `TInput` is feature-specific (e.g. a resume + job target pair for RESUME_OPTIMIZATION) — left generic here since no feature builder exists yet in this phase. */
export interface PromptContext<TInput = unknown> {
  userId: string;
  locale?: string;
  input: TInput;
}

export interface PromptResult {
  text: string;
  version: PromptVersion;
  /** SHA-256 hex digest of `text`, via PromptHash — never re-derived ad hoc elsewhere. */
  hash: string;
  metadata: PromptMetadata;
}

/**
 * Abstract framework every feature-specific builder implements.
 * ResumeOptimizationPromptBuilder (Phase 7) is the first; CoverLetterPromptBuilder,
 * InterviewPromptBuilder, CareerAdvisorPromptBuilder (FASE 18),
 * LinkedInPromptBuilder (FASE 19), AtsAiPromptBuilder (FASE 20),
 * TemplateRecommendationPromptBuilder (FASE 21), and CvImportPromptBuilder
 * (FASE 22) all followed the same pattern.
 */
export abstract class PromptBuilder<TInput = unknown> {
  abstract readonly metadata: PromptMetadata;
  abstract build(context: PromptContext<TInput>): PromptResult | Promise<PromptResult>;
}
