import type { GenerateResult, ResponseFormat } from './ai-provider.interface';
import type { RetryPolicy } from './retry-policy.interface';

/** Caller-supplied overrides for one execute() call. Every field is optional — omitting all of them uses the default provider/model/retry policy. */
export interface AIExecutionOptions {
  preferredProvider?: string;
  preferredModel?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  retryPolicy?: RetryPolicy;
  /** Interface-only in this phase — AiOrchestrationService.execute() does not yet branch on this flag. See docs/architecture/ai-orchestration.md "Streaming". */
  stream?: boolean;
  /** Forwarded to the provider's generate() call — see GenerateRequest.responseFormat. */
  responseFormat?: ResponseFormat;
  /**
   * Optional feature-specific extension of pipeline step 9 ("Validate
   * Response") — runs immediately after the built-in empty-text check,
   * inside the same spendAndExecute() work callback, so a thrown error here
   * gets the same automatic-refund + fail()-tracking treatment as any other
   * pipeline failure. Lets a feature (e.g. Resume Optimization) validate a
   * structured JSON contract without AiOrchestrationService needing to know
   * anything about that contract — see docs/architecture/ai-orchestration.md
   * §4.
   */
  responseValidator?: (result: GenerateResult) => void;
}
