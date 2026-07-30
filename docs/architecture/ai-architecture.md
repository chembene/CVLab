# CVLab AI — AI Architecture

Status: resolved decision (approved 2026-07-30). Resolves the "ai_requests table named nowhere in the prompts" gap flagged in the prior pass, per `prompts/03-ai-prompts.md` §"Cost Control".

## 1. Responsibility

The AI module is the single point of contact with the OpenAI API for CV improvement, cover letter generation, ATS analysis, interview question generation/evaluation, and career suggestions (`prompts/03-ai-prompts.md`, `prompts/09-product-vision.md` §5). No other module calls OpenAI directly.

## 2. Prompt Management

All prompt templates are stored as data/config, not inline strings in business logic (`prompts/03-ai-prompts.md` §"Prompt Management") — e.g. a `prompt_templates` config set, versioned, editable by Admin without a deploy (`prompts/09-product-vision.md`'s Admin capability to "Manage AI prompts"). Feature services (CV improvement, ATS, etc.) reference a prompt template by key; the AI module resolves and fills it.

## 3. Credit Integration

Every credit-consuming AI operation follows the RESERVE → PROCESS → COMMIT/RELEASE flow owned by Credits (see [credit-architecture.md](credit-architecture.md) §4) — the AI module never mutates wallet/ledger state itself, it only calls `Credits`' public methods around the OpenAI call:

```
Feature service (e.g. CVs.improve)
  → validate input
  → Credits.reserve(userId, cost, idempotencyKey)
  → AI.run(promptKey, input)          ← this is where OpenAI is actually called
  → on success: Credits.commit(reservationId), persist result (e.g. new CVVersion)
  → on platform failure: Credits.release(reservationId)
```

## 4. `ai_requests` — AI Request Tracking Model

A dedicated tracking table exists purely for cost tracking, usage analytics, debugging, auditing, and credit reconciliation — it is not part of the credit ledger itself (that's `credit_transactions`), but the two are cross-referenced.

| Field | Purpose |
|---|---|
| `id` | |
| `user_id` | FK → `users` |
| `feature` | e.g. `cv_improvement`, `ats_analysis`, `interview_evaluation` |
| `status` | `PENDING` / `SUCCEEDED` / `FAILED` / `TIMEOUT` |
| `model` | OpenAI model identifier used |
| `request_id` | OpenAI's own request/response ID, for support escalation — **not** an API key or credential |
| `input_tokens` / `output_tokens` / `total_tokens` | usage accounting |
| `estimated_cost` | computed from token counts × model pricing, stored for internal cost tracking |
| `credits_charged` | the actual credit amount charged to the user for this request (may be 0 if released/refunded) — cross-references the corresponding `credit_transactions` row via `reference` |
| `duration_ms` | latency tracking |
| `created_at` / `completed_at` | |
| `error_code` | normalized internal error classification on failure (never a raw provider stack trace) |
| `metadata` | JSONB, feature-specific extra context (never raw user CV content by default — see §5) |

Indexes: `user_id`, `(feature, created_at)` for analytics/reporting queries, `status` for operational monitoring of failures.

## 5. What `ai_requests` Never Stores

- OpenAI API keys or any credential/secret (`prompts/03-ai-prompts.md`, `prompts/05-security.md` §"Sensitive Data").
- Full raw prompts/completions by default — `metadata` is for structured operational context (which template, which feature flags), not a verbatim transcript store. If a future debugging need requires transcript retention, that is a separate, explicitly-opted-into, access-controlled log store — not bundled silently into this table's default behavior.

## 6. Relationship to Credits Ledger

`ai_requests.credits_charged` and the corresponding `credit_transactions` row are two views of the same event: `ai_requests` is the AI-operational record (tokens, latency, model, cost basis), `credit_transactions` is the financial ledger record (balance before/after, idempotency key). Reconciliation queries join the two on a shared `reference` (e.g. the `ai_requests.id`) to verify every charged credit corresponds to exactly one completed AI request, and vice versa.

## 7. AI Response Contract

Per `prompts/03-ai-prompts.md` §"AI Response", every AI feature response includes: score (where applicable), analysis, suggestions, improvement actions — structured output, not free text the frontend has to parse heuristically.

## 8. Integrity Rule (restated)

AI must never invent qualifications, degrees, jobs, companies, certifications, skills, or achievements. It may improve wording while strictly preserving factual user-supplied information (`prompts/10-business-rules.md` §11, `prompts/00-rules.md` "AI Integrity"). This is a prompt-design and output-validation concern for Phase 6 implementation, not something the tracking model itself enforces — noted here so the constraint isn't lost between documents.
