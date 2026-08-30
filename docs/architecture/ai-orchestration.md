# CVLab AI — AI Orchestration Engine

Status: **implemented, Phase 6** (2026-08-02); **first feature (Resume Optimization) built on top of it, Phase 7** (2026-08-02) — see [resume-optimization.md](resume-optimization.md). Builds the production-ready orchestration layer every AI feature (Resume Optimization, Cover Letter, Interview AI, Career Coach, LinkedIn optimization, and a future AI-assisted ATS pass) must go through. **No real AI provider is integrated yet** — `DummyAIProvider` is the sole registered provider, deterministic and free of any external call, extended in Phase 7 with a JSON response mode (§2). This document supersedes [ai-architecture.md](ai-architecture.md) §3's illustrative RESERVE→PROCESS→COMMIT/RELEASE pseudocode with the concrete pipeline actually built.

## 1. Why this module exists

Per `prompts/00-rules.md` ("Never duplicate logic") and this phase's brief: no AI feature may call a provider or the credit ledger directly. Every feature — present or future — depends on `AiOrchestrationService`, never on `CreditService`, `AiRequestTrackingService`, or a provider SDK individually:

```
Resume Optimization  ↓
Cover Letter          ↓
Interview AI           →  AiOrchestrationService  →  AIProvider (interface)
Career Advisor        ↓
LinkedIn               ↓

Never: Resume Optimization → OpenAI directly
Never: Cover Letter → Claude directly
Never: any feature → CreditService.spend() directly (must go through the pipeline)
```

This mirrors two precedents already established in this codebase: `BillingProvider`/`BILLING_PROVIDER` (Phase 5) as the DI abstraction pattern, and `CreditService.spendAndExecute()` (Phase 5) as the RESERVE→PROCESS→COMMIT/RELEASE implementation this pipeline reuses rather than reinventing.

## 2. Provider Abstraction

`apps/api/src/ai-orchestration/interfaces/ai-provider.interface.ts` defines `AIProvider`:

```
interface AIProvider {
  readonly name: string;
  generate(request: GenerateRequest): Promise<GenerateResult>;
  stream(request: GenerateRequest): AsyncIterable<StreamChunk>;
  health(): Promise<ProviderHealthStatus>;
  countTokens(text: string): Promise<number>;
  estimateCost(request: GenerateRequest): Promise<CostEstimate>;
  supportedModels(): string[];
}
```

- **`ProviderRegistry`** — an in-memory `Map<string, AIProvider>` keyed by `AIProvider.name`. Nothing in the pipeline imports a concrete provider class; everything goes through this registry.
- **`ProviderSelector`** — resolves an `AIProvider` from the registry, defaulting to `DEFAULT_PROVIDER_NAME = 'dummy'` when no `preferredProvider` is given. Throws `ProviderUnavailableError` (retryable) when the requested provider isn't registered.
- **`ModelSelector`** — picks a model from the chosen provider's `supportedModels()`, defaulting to the first entry. Throws `ModelUnavailableError` (not retryable) for an unsupported model or a provider with zero models.
- **`DummyAIProvider`** — the only registered implementation, registered into `ProviderRegistry` by `AiOrchestrationModule.onModuleInit()`. Every response is derived deterministically from a SHA-256 digest of the input prompt (same prompt → same text, token counts, cost estimate, requestId), so pipeline/retry/cost tests are fully deterministic without mocking the provider. Mirrors `MpesaBillingProvider`'s disclosed-placeholder pattern: real behavior, zero external calls. **Phase 7 addition:** when `GenerateRequest.responseFormat === 'json'`, `generate()` returns a deterministic, syntactically valid JSON string (`{ summary, predictedScore, suggestions: [...] }`) instead of its default free-text sentence — a generic, feature-agnostic contract (not aware of Resume Optimization specifically) that any future JSON-mode feature's own response parser is responsible for validating/mapping into its own types.

**Adding a real provider later** (OpenAI, Anthropic, Gemini) means writing a new class implementing `AIProvider` and registering it in `AiOrchestrationModule` — no change to `ProviderSelector`, `ModelSelector`, or `AiOrchestrationService`.

## 3. Prompt Engine

`apps/api/src/ai-orchestration/interfaces/prompt.interface.ts`:

- **`PromptVersion`** — a named alias for `number`, so `PromptMetadata.version`/`PromptResult.version` read as versioned revisions, not arbitrary integers.
- **`PromptMetadata`** — `{ feature: AIFeature; version: PromptVersion; description?: string }`.
- **`PromptContext<TInput>`** — `{ userId; locale?; input: TInput }`, handed to a builder's `build()`. Distinct from `AIExecutionContext` (orchestration-level identity: userId/feature/correlationId/idempotencyKey) — `PromptContext` is what a feature builder actually renders text from.
- **`PromptResult`** — `{ text; version; hash; metadata }`. `hash` is always `PromptHash.generate(text)` (SHA-256 hex), never computed ad hoc elsewhere.
- **`PromptBuilder<TInput>`** (abstract class) — the framework every feature-specific builder implements: `ResumeOptimizationPromptBuilder` (**implemented, Phase 7** — see [resume-optimization.md](resume-optimization.md) §"Prompt Builder"), `CoverLetterPromptBuilder`, `InterviewPromptBuilder`, `CareerAdvisorPromptBuilder`, `LinkedInPromptBuilder` (remain for their own future phases).

### Prompt Registry

`PromptRegistry` resolves a `PromptBuilder` by `AIFeature`. `AiOrchestrationModule` itself registers no feature builders — each feature module registers its own in its own `onModuleInit()` (`ResumeOptimizationModule` is the first example, Phase 7). Calling `execute()` for a feature with no registered builder throws `PromptBuilderNotFoundError`.

### Feature Keys

`AIFeature` (`apps/api/src/ai-orchestration/constants/ai-feature.enum.ts`) is the closed set of features the orchestration engine (and, by extension, the credit system) knows about:

| Enum value                      | `feature_pricing.featureKey` / `ai_requests.feature` string |
| ------------------------------- | ----------------------------------------------------------- |
| `AIFeature.ATS_AI`              | `ats_ai`                                                    |
| `AIFeature.RESUME_OPTIMIZATION` | `resume_optimization`                                       |
| `AIFeature.COVER_LETTER`        | `cover_letter`                                              |
| `AIFeature.INTERVIEW`           | `interview`                                                 |
| `AIFeature.CAREER_ADVISOR`      | `career_advisor`                                            |
| `AIFeature.LINKEDIN`            | `linkedin`                                                  |

`ATS_AI` is deliberately distinct from Phase 4's deterministic `ats_reports` engine — it is the future AI-assisted ATS suggestion feature `JobTargetAnalysisService.calculateATS()` (Phase 2B stub) anticipates, not a replacement for the rule-based one. **A future seed script for `feature_pricing` must use these exact key strings** — see the known gap already flagged in [credit-architecture.md](credit-architecture.md) §5, still open as of this phase.

## 4. Execution Pipeline

`AiOrchestrationService.execute()` (`apps/api/src/ai-orchestration/pipeline/ai-orchestration.service.ts`) runs, in this exact order, per the brief:

```
1.  Validate Request
2.  Load Context
3.  Credit Check
4.  Charge Credits
5.  Build Prompt
6.  Select Provider
7.  Select Model
8.  Execute Provider
9.  Validate Response
10. Store AI Request
11. Return Result

On failure: Automatic refund → Record failure → Store failure metadata
```

**Implementation note:** steps 4–10 live inside `CreditService.spendAndExecute()`'s `work` callback (Phase 5's concrete RESERVE→PROCESS→COMMIT/RELEASE implementation — charge, run work, auto-refund on any thrown error). Rather than re-implementing "automatic refund + record failure" bookkeeping, this pipeline inherits it directly from Phase 5:

- **Step 1 (Validate Request)** checks `userId`/`feature`/`idempotencyKey` are present **and** that a `PromptBuilder` is registered for the requested feature (via `PromptRegistry.resolve()`, which throws `PromptBuilderNotFoundError` if missing). This runs before any credit is touched — calling `execute()` for an unimplemented feature costs nothing, per `credit-architecture.md` §4 step 1 ("validate input first... before any credit reservation happens"), extended here to "a request that can't possibly be fulfilled is treated the same as invalid input."
- **Step 2 (Load Context)** builds an `AIExecutionContext` — a fresh `correlationId` (UUID) per call, ties together the credit transaction's `reference`, the `ai_requests` row's `metadata`, and log lines for one logical request.
- **Step 3 (Credit Check)** calls `CreditService.estimate()` — a read-only balance peek. If insufficient, throws `InsufficientCreditsException` (Phase 5's own exception type, reused rather than duplicated) **before** `spendAndExecute()` is ever called, so no reservation exists to clean up.
- **Step 4 (Charge Credits)** is `CreditService.spendAndExecute()` opening — everything from here to step 10 is its guarded `work` callback.
- **Step 5 (Build Prompt)** resolves the builder (again — a second, cheap `Map` lookup; the first was step 1's validation) and calls `builder.build()`.
- **Steps 6–7 (Select Provider / Select Model)** as described in §2.
- Before step 8, the pipeline calls `provider.estimateCost()` once — this is the value stored as `ai_requests.estimated_cost`, matching the field's name ("estimated," not a post-hoc actual).
- **Step 8 (Execute Provider)** wraps `provider.generate()` in `RetryExecutor.execute()` under the caller's `AIExecutionOptions.retryPolicy` (or `DEFAULT_RETRY_POLICY`). Immediately before this step, `AiRequestTrackingService.start()` creates the `ai_requests` row (`PENDING`), so `createdAt` is effectively "started."
- **Step 9 (Validate Response)** rejects an empty/whitespace-only `GenerateResult.text` with `InvalidPromptError`, then — **Phase 7 addition** — runs an optional caller-supplied `AIExecutionOptions.responseValidator(result)` hook. This lets a feature validate its own response contract (e.g. Resume Optimization's JSON shape) _inside_ the same `spendAndExecute()` work callback, so a thrown error there gets the identical automatic-refund + `fail()`-tracking treatment as any other pipeline failure, without `AiOrchestrationService` needing to know anything about that feature's contract. See [resume-optimization.md](resume-optimization.md) §"Parser" for the first real usage.
- **Step 10 (Store AI Request)** calls `AiRequestTrackingService.complete()`, finalizing the row created in step 8 with token usage, cost, and duration. `completedAt` is "finished."
- **Step 11 (Return Result)** — `spendAndExecute()` resolves with the `AIExecutionResult`.

### Failure handling

Any error thrown between "Charge Credits" and "Return Result" is caught twice:

1. **Inner catch** (inside the `work` callback, around steps 8–10): calls `AiRequestTrackingService.fail()` with the error's code, duration, and the credits that were charged (so a failed row still shows `creditsCharged: 30`, not `0` — the charge genuinely happened even though it was refunded), then rethrows.
2. **`CreditService.spendAndExecute()`** catches that rethrow, calls `RefundService.refund()` automatically (idempotency key `refund:${originalKey}`), and rethrows the original error again.
3. **Outer catch** (in `AiOrchestrationService.execute()` itself): since the refund has already happened by the time this runs, it calls `AiRequestTrackingService.recordRefund()` to reflect that on the `ai_requests` row — but only if an `ai_requests` row was actually created for this attempt (i.e., the failure happened at or after step 8). A failure in step 5 (Build Prompt) or step 6/7 (Select Provider/Model) still triggers the automatic refund at the ledger level, but leaves no `ai_requests` row to update — there is nothing to "fail" if execution never reached the provider.

This is proven end-to-end against real Postgres in `apps/api/test/ai-orchestration.e2e-spec.ts`: a throwing `PromptBuilder` (refund with no `ai_requests` row) and a provider that always fails with a retryable error (retries exhausted → `RetryLimitExceededError` → refund + a `FAILED` `ai_requests` row) are both exercised.

## 5. Retry Policy

`apps/api/src/ai-orchestration/retry/retry-executor.ts`:

```
interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoff: 'fixed' | 'exponential';
}
```

`RetryExecutor.execute(fn, policy)` retries `fn` up to `maxAttempts` times. Retryability is decided by the error itself — `AIError.retryable` — not a separate allow-list maintained in the executor. A non-`AIError` (an unexpected bug, not a modeled failure mode) is never retried and propagates immediately. Once every attempt is exhausted, `RetryLimitExceededError` wraps the last underlying error. The `sleep` function is injectable, purely so unit tests can run instantly without waiting on real backoff delays.

`DEFAULT_RETRY_POLICY`: 3 attempts, 200ms base delay, exponential backoff, capped at 2000ms.

## 6. Cache Abstraction

`apps/api/src/ai-orchestration/interfaces/ai-cache.interface.ts` defines `AICacheService` (`get`/`set`/`delete`) and `AICacheKeyBuilder.build(feature, provider, model, promptHash)`. **`NoopAiCacheService`** (always misses, never stores) is registered behind the `AI_CACHE_SERVICE` DI token today — mirroring the `BillingProvider`/`BILLING_PROVIDER` pattern, so a future Redis-backed implementation is a one-line `useClass` swap.

**Not wired into the pipeline in this phase.** The 11-step execution order given in this phase's brief has no cache-check step, and inserting one wasn't part of the brief — a future phase would most naturally check the cache (keyed by `AICacheKeyBuilder.build(feature, provider.name, model, promptResult.hash)`) between "Select Model" and "Execute Provider," skipping straight to "Store AI Request" with `cached: true` on a hit. `AIExecutionResult.cached` already exists and is hardcoded `false` today, ready for that change.

## 7. Error Hierarchy

`apps/api/src/ai-orchestration/errors/` — every error extends `AIError`, itself an `HttpException` (not a plain `Error`), so whichever future controller sits in front of `AiOrchestrationService` — none exists yet — gets correct HTTP status codes for free through `AllExceptionsFilter`, the same pattern `InsufficientCreditsException` established in Phase 5.

| Error                        | `code`                        | HTTP status | `retryable`                    |
| ---------------------------- | ----------------------------- | ----------- | ------------------------------ |
| `ProviderUnavailableError`   | `AI_PROVIDER_UNAVAILABLE`     | 503         | **true**                       |
| `InvalidPromptError`         | `AI_INVALID_PROMPT`           | 422         | false                          |
| `TokenLimitExceededError`    | `AI_TOKEN_LIMIT_EXCEEDED`     | 422         | false                          |
| `ModelUnavailableError`      | `AI_MODEL_UNAVAILABLE`        | 503         | false                          |
| `ExecutionTimeoutError`      | `AI_EXECUTION_TIMEOUT`        | 504         | **true**                       |
| `RetryLimitExceededError`    | `AI_RETRY_LIMIT_EXCEEDED`     | 502         | false (terminal by definition) |
| `PromptBuilderNotFoundError` | `AI_PROMPT_BUILDER_NOT_FOUND` | 500         | false                          |

`code` is also what's written to `ai_requests.error_code` on failure — a stable, machine-readable identifier independent of HTTP status, for log filtering and analytics regardless of whether a controller ever surfaces these over HTTP.

`ExecutionTimeoutError` is defined but nothing in this phase's pipeline throws it yet — `AIExecutionOptions.timeoutMs` exists but `AiOrchestrationService.execute()` doesn't currently race the provider call against a timer. Wiring that (`Promise.race` against a timeout that throws `ExecutionTimeoutError`) is a small, self-contained addition for whichever phase first integrates a provider slow enough to need it.

## 8. `ai_requests` Extension

Per this phase's brief ("Extend the existing AI tracking service"), `ai_requests` gained `prompt_version` (migration `20260802102311_ai_orchestration_prompt_version`), joining `provider`/`prompt_hash`/`credits_refunded` from Phase 5. `AiRequestTrackingService.fail()` was also extended to accept `creditsCharged` (previously only settable via `complete()`) — necessary so a `FAILED` row still shows the credits that were genuinely charged-then-refunded, rather than defaulting to `0` and looking like `creditsRefunded > creditsCharged`.

**`startedAt`/`finishedAt` from the brief map onto the existing `createdAt`/`completedAt` columns** rather than new ones: `createdAt` is set when `AiRequestTrackingService.start()` creates the row (immediately before "Execute Provider," effectively "started"), and `completedAt` when `complete()`/`fail()` finalizes it ("finished"). No new columns were added for this — reusing the Phase 5 columns avoids two pairs of timestamp fields meaning the same thing.

## 9. Streaming

`AIProvider.stream()` and `StreamChunk` (`{ delta: string; done: boolean }`) exist on the interface and are implemented by `DummyAIProvider` (yields word-by-word chunks, ending with an empty `done: true` chunk) — proving the interface shape works, in-process, with no transport involved. `AIExecutionOptions.stream` exists as a flag. **No SSE/WebSocket transport exists, and `AiOrchestrationService.execute()` does not branch on `options.stream`** — per this phase's brief, streaming is interface-only. A future phase adding real streaming would add an `executeStream()` method (or branch inside `execute()`) that drives `provider.stream()` and forwards `StreamChunk`s to an SSE/WebSocket transport, reusing the same credit-check/charge/tracking scaffolding.

## 10. Dependency Diagram

```
(future) Resume Optimization, Cover Letter, Interview, Career Advisor, LinkedIn
  → AiOrchestrationService
      → PromptRegistry → PromptBuilder (feature-specific, none registered yet)
      → ProviderSelector → ProviderRegistry → AIProvider (DummyAIProvider today)
      → ModelSelector
      → RetryExecutor
      → CreditService.estimate() / .spendAndExecute()   (Phase 5, reused unchanged)
      → AiRequestTrackingService.start()/.complete()/.fail()/.recordRefund()  (Phase 5, extended)

AiOrchestrationModule → CreditsModule, AiRequestTrackingModule
AI_CACHE_SERVICE → NoopAiCacheService (placeholder; not called by the pipeline yet)
BILLING_PROVIDER → MpesaBillingProvider (Phase 5; unrelated to this module, no dependency between them)
```

No AI feature is ever allowed to depend on `CreditService` or a provider SDK directly — only on `AiOrchestrationService`. This is the same shape as the `Payments → BillingProvider ← MpesaBillingProvider` dependency-inversion pattern in [module-boundaries.md](module-boundaries.md) §3, applied to AI providers instead of payment providers.

## 11. Future Provider Integration

Adding a real provider (e.g. OpenAI) requires, and only requires:

1. A new class implementing `AIProvider` (`apps/api/src/ai-orchestration/providers/openai-provider.ts` or similar) — real `generate()`/`stream()`/`health()`/`countTokens()`/`estimateCost()`/`supportedModels()`, sourced from the official OpenAI API documentation at that phase's implementation time, never invented in advance (`prompts/00-rules.md` "Do Not Guess").
2. Registering it in `AiOrchestrationModule` (either alongside `DummyAIProvider` for a fallback/test path, or replacing it as the default via `DEFAULT_PROVIDER_NAME`).
3. Zero changes to `ProviderSelector`, `ModelSelector`, `AiOrchestrationService`, `RetryExecutor`, or any error type — they are already provider-agnostic.

Adding a real feature required, and only required, the same 4 steps — Resume Optimization (Phase 7) is the worked example:

1. A `ResumeOptimizationPromptBuilder extends PromptBuilder<ResumeOptimizationPromptInput>` implementing `build()` — done.
2. Registering it into `PromptRegistry` for `AIFeature.RESUME_OPTIMIZATION`, via `ResumeOptimizationModule.onModuleInit()` — done.
3. A `feature_pricing` row for `resume_optimization` — **still not seeded** in a fresh environment (the open gap from [credit-architecture.md](credit-architecture.md) §5); Phase 7's own e2e suite inserts one manually, same as Phase 6's did for its test features.
4. A controller calling `AiOrchestrationService.execute({ feature: AIFeature.RESUME_OPTIMIZATION, ... })` — done (`ResumeOptimizationController`, no controller existed for any feature before this phase).

See [resume-optimization.md](resume-optimization.md) for the full feature writeup. The next feature (Cover Letter, Interview, Career Advisor, or LinkedIn) follows the identical 4 steps, none of which touch `AiOrchestrationService`, `ProviderSelector`, `ModelSelector`, `RetryExecutor`, or the error hierarchy.

## 12. Known Limitations (disclosed, not fixed this phase)

- **No real provider.** `DummyAIProvider` is the only registered `AIProvider` — by design; still true after Phase 7.
- **Only one feature builder registered.** `PromptRegistry` has `ResumeOptimizationPromptBuilder` (Phase 7); every other `AIFeature` still throws `PromptBuilderNotFoundError` until its own phase registers a builder.
- **`ResumeOptimizationController` is the only controller calling this pipeline.** Every other future feature is still reachable only via direct service calls in tests, the pattern Phase 5 established for `CreditService`.
- **Idempotency protects the credit charge, not a duplicate provider call.** If `execute()` is called twice with the same `idempotencyKey`, `CreditService.spend()` (inside `spendAndExecute()`) correctly returns the existing transaction without charging twice — but `spendAndExecute()`'s `work` callback (steps 5–10, including the actual `provider.generate()` call) still runs in full both times. `AiRequestTrackingService.start()` returns the same `ai_requests` row on the second call (also idempotent), and `complete()` simply re-writes equivalent data over it, so the **economic** outcome is correct (verified in `ai-orchestration.e2e-spec.ts`), but a real, non-free provider would be called (and its real-world cost incurred) twice for one logical request. A future optimization would have `execute()` check `AiRequestTrackingRepository.findByIdempotencyKey()` before entering the pipeline at all, short-circuiting steps 3–10 entirely on a replay — not implemented this phase, since it wasn't needed to prove ledger correctness and `DummyAIProvider` has no real cost to duplicate.
- **No cache integration.** The abstraction exists; nothing calls it (§6).
- **No timeout enforcement.** `AIExecutionOptions.timeoutMs` and `ExecutionTimeoutError` exist; nothing currently races a provider call against a timer (§7).
- **`feature_pricing` seed data.** Still the open gap from Phase 5 — `AIFeature`'s six keys must be seeded before any feature built on this pipeline can price itself in a fresh environment.

## 13. Testing

- **Unit** (`apps/api/src/ai-orchestration/**/*.spec.ts`): `PromptHash` determinism, `PromptRegistry` register/resolve/not-found, `ProviderRegistry` register/get/list, `ProviderSelector` default/explicit/unavailable, `ModelSelector` default/explicit/unavailable, `DummyAIProvider` determinism/tokens/cost/streaming/health, `RetryExecutor` success/retry/exhaustion/non-retryable/backoff timing, `NoopAiCacheService` always-miss, and `AiOrchestrationService` itself — full pipeline call order (via Jest's `invocationCallOrder`), insufficient-credits short-circuit, unregistered-feature short-circuit, invalid-request short-circuit, provider-failure → fail()+refund, empty-response → `InvalidPromptError`, and no-`ai_requests`-row-on-pre-provider-failure.
- **E2E** (`apps/api/test/ai-orchestration.e2e-spec.ts`, real Postgres): full pipeline via `DummyAIProvider` with real credit charging; `preferredModel` honored end-to-end; insufficient credits touches nothing; unregistered feature touches nothing; a throwing test `PromptBuilder` triggers a real automatic refund with no `ai_requests` row; a real always-failing test `AIProvider` proves retries happen the configured number of times, then `RetryLimitExceededError`, a real refund, and a `FAILED` row with `creditsCharged`/`creditsRefunded` both correct; replaying the same `idempotencyKey` never double-charges the ledger.

All tests are deterministic — no real external API is called anywhere in this test suite.

**Phase 7 additions:** `DummyAIProvider`'s JSON response-format mode and `AiOrchestrationService`'s `responseValidator` hook (both used by Resume Optimization) each gained their own unit test coverage in this module's existing spec files. The feature-level tests (prompt builder, response parser, apply engine, service, controller, e2e) live in `apps/api/src/resume-optimization/` and `apps/api/test/resume-optimization.e2e-spec.ts` — see [resume-optimization.md](resume-optimization.md) §"Testing".
