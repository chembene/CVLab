import type { AIFeature } from '../constants/ai-feature.enum';
import type { TokenUsage } from './ai-provider.interface';
import type { PromptVersion } from './prompt.interface';

/** What AiOrchestrationService.execute() resolves with on success — the "Return Result" pipeline step's payload. */
export interface AIExecutionResult {
  aiRequestId: string;
  feature: AIFeature;
  provider: string;
  model: string;
  text: string;
  tokenUsage: TokenUsage;
  estimatedCost: number;
  creditsCharged: number;
  promptVersion: PromptVersion;
  promptHash: string;
  durationMs: number;
  /** Always false in this phase — the cache abstraction exists but the pipeline doesn't consult it yet. */
  cached: boolean;
}
