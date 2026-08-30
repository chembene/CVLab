import type { AIFeature } from '../constants/ai-feature.enum';
import type { AIExecutionOptions } from './ai-execution-options.interface';

/** Input to AiOrchestrationService.execute(). `TInput` is passed through unchanged to the resolved PromptBuilder's build(). */
export interface ExecuteAIRequestInput<TInput = unknown> {
  userId: string;
  feature: AIFeature;
  input: TInput;
  idempotencyKey: string;
  locale?: string;
  options?: AIExecutionOptions;
}
