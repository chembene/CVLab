/**
 * Provider abstraction — the orchestration layer never knows a concrete
 * provider (OpenAI, Claude, Gemini, ...) exists. Every provider, including
 * the placeholder DummyAIProvider, implements this same interface, per
 * docs/architecture/ai-orchestration.md "Provider Abstraction".
 */

export type ResponseFormat = 'text' | 'json';

export interface GenerateRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** Structured-output hint, mirroring what every real provider already exposes in some form (OpenAI's `response_format`, Gemini's `responseMimeType`, Claude's tool-use/instruction pattern) — provider-agnostic by design, not resume-optimization-specific. Defaults to free text when omitted. */
  responseFormat?: ResponseFormat;
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export type FinishReason = 'stop' | 'length' | 'error';

export interface GenerateResult {
  text: string;
  provider: string;
  model: string;
  tokenUsage: TokenUsage;
  finishReason: FinishReason;
  /** The provider's own request/response identifier — never a credential, per docs/architecture/ai-architecture.md §5. */
  requestId: string;
  raw?: unknown;
}

/** One chunk of a streamed generation. `done: true` marks the final chunk (delta is empty on that chunk). */
export interface StreamChunk {
  delta: string;
  done: boolean;
}

export interface ProviderHealthStatus {
  provider: string;
  available: boolean;
  checkedAt: Date;
  message?: string;
}

export interface CostEstimate {
  provider: string;
  model: string;
  estimatedCost: number;
  currency: 'USD';
  tokenUsage: TokenUsage;
}

export interface AIProvider {
  /** Unique registry key, e.g. "dummy", "openai", "anthropic". */
  readonly name: string;

  generate(request: GenerateRequest): Promise<GenerateResult>;

  /**
   * Streaming variant of generate(). Interface-only in this phase — no
   * SSE/WebSocket transport exists yet to carry these chunks to a client;
   * see docs/architecture/ai-orchestration.md "Streaming".
   */
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;

  health(): Promise<ProviderHealthStatus>;

  countTokens(text: string): Promise<number>;

  estimateCost(request: GenerateRequest): Promise<CostEstimate>;

  supportedModels(): string[];
}
