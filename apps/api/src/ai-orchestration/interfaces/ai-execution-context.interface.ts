import type { AIFeature } from '../constants/ai-feature.enum';

/**
 * Built by AiOrchestrationService's "Load Context" pipeline step from the
 * caller's ExecuteAIRequestInput. Distinct from PromptContext: this is
 * orchestration-level bookkeeping (who, which feature, which
 * request/idempotency identity), not the feature-specific input a
 * PromptBuilder renders into text.
 */
export interface AIExecutionContext {
  userId: string;
  feature: AIFeature;
  /** Generated fresh per execute() call — ties together logs, the ai_requests row, and the credit_transactions reference for one logical request. */
  correlationId: string;
  idempotencyKey: string;
  locale?: string;
}
