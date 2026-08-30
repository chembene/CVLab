# CVLab AI — AI Cover Letter Engine

Status: **implemented, Phase 8** (2026-08-02). The second real AI feature built on top of [ai-orchestration.md](ai-orchestration.md) (Phase 6), following the exact template [resume-optimization.md](resume-optimization.md) (Phase 7) established. **`DummyAIProvider` is still the only registered provider** — every "AI-generated" cover letter in this phase is deterministic, derived from a SHA-256 digest of the prompt, never a real model call.

## 1. Why this module exists

Per this phase's brief: Cover Letter must reuse everything already built — AI Orchestration, Credits, Resume Variants, Job Targets, ATS, History, AI Request Tracking — with zero duplicated logic. Every dependency is consumed through its own owning module's public service methods, never through raw Prisma access from here:

```
CoverLetterService
  → ResumeVariantService.getOne() / assertOwnerOrAdmin      (Phase 3, reused unchanged)
  → JobTargetService.getOne()                                (Phase 2B, reused unchanged)
  → AtsAnalysisService.run() / AtsReportRepository            (Phase 4, reused unchanged — same
                                                                "reuse latest or run fresh" pattern
                                                                as Resume Optimization's baseline)
  → ResumeOptimizationService.getOne()                        (Phase 7, reused unchanged — verifies
                                                                an optional optimizationId and reads
                                                                its summary)
  → AiOrchestrationService.execute()                          (Phase 6, reused unchanged — this is the
                                                                ONLY path to a provider or the credit
                                                                ledger)
```

`CoverLetterService` never calls `CreditService` directly and never calls an `AIProvider` directly — both rules are enforced structurally: the service has no dependency on `CreditService` or `ProviderRegistry` at all, only on `AiOrchestrationService`, exactly mirroring `ResumeOptimizationService`'s Phase 7 precedent.

## 2. Database

Migration `20260802183957_cover_letter_engine`.

### `cover_letters`

| Column                                     | Type                                       | Notes                                                                                                        |
| ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `id`                                       | uuid PK                                    |                                                                                                              |
| `user_id`                                  | uuid FK → `users`                          |                                                                                                              |
| `resume_variant_id`                        | uuid FK → `resume_variants`                |                                                                                                              |
| `job_target_id`                            | uuid FK → `job_targets`                    |                                                                                                              |
| `optimization_id`                          | uuid FK → `resume_optimizations`, nullable | The Resume Optimization run whose summary informed this letter's prompt, if any                              |
| `title`                                    | text                                       |                                                                                                              |
| `content`                                  | text                                       | The full cover letter body                                                                                   |
| `tone`                                     | `CoverLetterTone`                          | PROFESSIONAL \| MODERN \| EXECUTIVE \| TECHNICAL \| FRIENDLY                                                 |
| `language`                                 | text (not an enum)                         | e.g. `"en"`, `"pt-MZ"` — open string, same rationale as `MasterResume.status`                                |
| `version`                                  | int, default 1                             | See §6 "Versioning" — never incremented in place                                                             |
| `status`                                   | `CoverLetterStatus`                        | DRAFT → GENERATED/EDITED → ARCHIVED, see §7                                                                  |
| `credits_used`                             | int, default 0                             | Snapshot of what `CreditService.spendAndExecute()` actually charged for _this row_ — 0 for a duplicated copy |
| `generated_by_ai`                          | boolean, default true                      | `false` only for rows created by `duplicate()`                                                               |
| `created_at` / `updated_at` / `deleted_at` | timestamps                                 | Soft-deleted, matching Resume Variant/Resume Optimization (§3)                                               |

Both directions of every relation are declared in `schema.prisma` (`User.coverLetters`, `JobTarget.coverLetters`, `ResumeVariant.coverLetters`, `ResumeOptimization.coverLetters`), per Prisma's requirement for a matching back-reference on every `@relation`.

## 3. Module

`apps/api/src/cover-letter/`:

```
cover-letter-prompt-builder.ts    PromptBuilder<CoverLetterPromptInput> implementation
cover-letter-response.parser.ts   Validates the AI's raw JSON text into typed data
cover-letter.repository.ts        Only Prisma access for `cover_letters`
cover-letter.service.ts           Orchestrates the full flow (§4)
cover-letter.controller.ts        8 endpoints (§8)
cover-letter.module.ts            Registers the PromptBuilder on boot
dto/
  generate-cover-letter.dto.ts
  update-cover-letter.dto.ts
```

## 4. Main Flow

```
Resume Variant
  ↓
Job Target (must be linked — 400 otherwise, same rule as Resume Optimization)
  ↓
ATS Report (reused if one exists, or run fresh)
  ↓
Resume Optimization Summary (only if optimizationId supplied — verified owned via ResumeOptimizationService.getOne())
  ↓
AI Orchestration (AiOrchestrationService.execute())
  ↓
Prompt Builder (CoverLetterPromptBuilder)
  ↓
AI Provider (DummyAIProvider, JSON mode)
  ↓
Parsed {title, coverLetter, summary}
  ↓
New cover_letters row (version 1, status GENERATED)
```

`generate()` and `regenerate()` share one private `runGeneration()` method — the only place `AiOrchestrationService.execute()` is called from this module.

## 5. Prompt Builder & Expected AI Response

`CoverLetterPromptBuilder` (`AIFeature.COVER_LETTER` — already reserved as an enum value since Phase 6; this phase is its first real registration) renders one prompt containing, per the brief: the Resume Variant's `content` snapshot, the Job Target, the latest ATS Report's score/missing-keywords/missing-skills, the Resume Optimization summary (verbatim, or `"(none available)"` when no `optimizationId` was supplied — never a fabricated placeholder), the desired tone, and the desired language, ending with an explicit "Respond with JSON ONLY" instruction and schema:

```json
{
  "title": "string",
  "coverLetter": "string",
  "summary": "string"
}
```

`CoverLetterResponseParser.parse(rawText)` validates JSON syntax, then that `title`/`coverLetter`/`summary` are all present, non-empty strings — throwing `InvalidPromptError` otherwise, per the brief. Structurally identical to `ResumeOptimizationResponseParser` (Phase 7), just a simpler, flatter contract (no array of typed sub-objects to validate).

**Where this runs matters:** exactly as established in Phase 7, the parser runs twice per generation — once as `AIExecutionOptions.responseValidator` (inside `AiOrchestrationService.execute()`'s "Validate Response" step, so a malformed response fails _inside_ `CreditService.spendAndExecute()`'s guarded callback and triggers the automatic refund), and once more on the already-validated text to obtain the parsed object for persistence.

### DummyAIProvider's JSON contract, extended

Phase 7 established that `DummyAIProvider.generate()`'s JSON mode returns one **generic, deterministic, superset envelope** — not aware of any specific feature. This phase adds `title` and `coverLetter` fields to that same envelope (alongside Resume Optimization's pre-existing `summary`/`predictedScore`/`suggestions`), so `DummyAIProvider` never needs to learn which feature is asking; `CoverLetterResponseParser` simply reads the two fields it cares about (`title`, `coverLetter`) plus `summary` (shared with Resume Optimization's own contract) and ignores the rest. See [ai-orchestration.md](ai-orchestration.md) §2.

## 6. Versioning

Per the brief: **"Never overwrite previous versions. Every regeneration creates a new version."** `regenerate()` creates a **brand-new row** (`repository.create()`, a fresh `id`) with `version = source.version + 1`, copying the source row's `resumeVariantId`/`jobTargetId`/`tone`/`language`/`optimizationId` as the generation parameters — the source row is never read via `repository.update()` anywhere in `regenerate()`'s call path, so it is provably untouched.

This deliberately follows `AtsReport`'s "always create a new one, never overwrite" precedent (Phase 4) rather than `ResumeVariant`'s in-place edit-counter (Phase 3): the brief's own wording ("never overwrite," "new version") for Cover Letter matches ATS's append-only philosophy, not Resume Variant's mutate-in-place one. `GET /cover-letter` lists every version as an independent row — there is no separate "get version history for this letter" endpoint in this phase's brief, and no parent-link column exists to group versions formally; a lineage is only reconstructable informally via matching `resumeVariantId`/`jobTargetId` and ascending `version` numbers. This is a disclosed, deliberate scope limit — see §11.

Manual edits (`PUT /cover-letter/:id`) and `duplicate()` are the two operations that do **not** follow this rule, by design:

- `PUT` updates the existing row in place (title/content/tone/language) and sets `status: EDITED` — it never touches `version`, since it isn't a regeneration.
- `duplicate()` creates a new, fully independent row with `version` reset to `1` — a new letter, not a new version of the same letter (mirrors `ResumeVariant.duplicate()`'s exact Phase 3 precedent).

## 7. Status Lifecycle & Archive/Restore

`CoverLetterStatus` (`DRAFT → GENERATED/EDITED → ARCHIVED`) has **no `PENDING` or `FAILED` value**, unlike Resume Optimization's `OptimizationStatus`. This is a deliberate difference this phase's schema makes explicit, not an oversight: a `cover_letters` row is only ever created **after** a successful, parsed AI response (or by `duplicate()`). If `AiOrchestrationService.execute()` throws for any reason — including this feature's own `responseValidator` rejecting a malformed response — `CoverLetterService.generate()`/`regenerate()` simply propagate the error; no row is created, and there is nothing to mark `FAILED`. The automatic credit refund (already fully handled inside `AiOrchestrationService.execute()`) is the only bookkeeping a failure leaves behind. This is why the brief's History Events list (§9) has no `cover_letter_failed` entry, unlike Resume Optimization's `optimization_failed` — the schema and the event list agree with each other.

**Archive** (`PUT /cover-letter/:id/archive`) sets `status: ARCHIVED`; idempotent no-op (no duplicate history event) if already archived.

**Restore** (`PUT /cover-letter/:id/restore`) must decide what to revert `status` _to_ — unlike `ResumeVariant`, which keeps a separate `archived: Boolean` alongside its own `status` string specifically so restore never loses information, `CoverLetterStatus` has exactly one status field with `ARCHIVED` as one of its four values, so archiving necessarily overwrites whatever status preceded it. `restore()` reconstructs a sensible status deterministically from the row's own `generatedByAI` column — reverting to `GENERATED` when true, `EDITED` when false — rather than adding a new column just to remember the pre-archive status. This is a disclosed, deliberate simplification (see §11); idempotent no-op if not currently archived.

## 8. Endpoints

| Method & path                       | Notes                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /cover-letter/generate`       | Body: `{ resumeVariantId, tone, language, optimizationId? }`. 400 if the variant has no linked job target. 404 if `optimizationId` doesn't belong to the caller. Charges credits via `AiOrchestrationService.execute()`. |
| `GET /cover-letter`                 | Lists the caller's own cover letters (every version as its own row), most recent first.                                                                                                                                  |
| `GET /cover-letter/:id`             | 404 for another user's letter or a soft-deleted one.                                                                                                                                                                     |
| `PUT /cover-letter/:id`             | Manual edit — `{ title?, content?, tone?, language? }`. Sets `status: EDITED`. Never touches `version` or credits.                                                                                                       |
| `POST /cover-letter/:id/regenerate` | No body — reuses the source row's tone/language/optimizationId. Creates a new row, `version + 1`. Charges credits again (a genuine new AI call).                                                                         |
| `POST /cover-letter/:id/duplicate`  | No body. Creates an independent copy, `version` reset to 1, `status: DRAFT`, `generatedByAI: false`, `creditsUsed: 0`.                                                                                                   |
| `PUT /cover-letter/:id/archive`     | Idempotent.                                                                                                                                                                                                              |
| `PUT /cover-letter/:id/restore`     | Idempotent; see §7 for the status-reconstruction rule.                                                                                                                                                                   |
| `DELETE /cover-letter/:id`          | Soft delete (`deletedAt`).                                                                                                                                                                                               |

All 8 routes require `JwtAuthGuard`, self-service-only (`user.id` is always both requester and target), matching every feature controller since Phase 2A.

## 9. Events

Reuses the generic `ResumeEntityChangedEvent` — no new dedicated event classes, matching every module except Credits. `ResumeEntityAction` was widened once more with `'generated'`. `HistoryListener` composes `eventType` as `${entityType}_${action}`, so:

| Emitted by     | `entityType`   | `action`    | `eventType`                                                                                                                                                                                                                                                                                             |
| -------------- | -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate()`   | `cover_letter` | `generated` | `cover_letter_generated`                                                                                                                                                                                                                                                                                |
| `regenerate()` | `cover_letter` | `generated` | `cover_letter_generated` (reused — a regeneration genuinely _is_ another AI generation event)                                                                                                                                                                                                           |
| `update()`     | `cover_letter` | `updated`   | `cover_letter_updated`                                                                                                                                                                                                                                                                                  |
| `archive()`    | `cover_letter` | `archived`  | `cover_letter_archived`                                                                                                                                                                                                                                                                                 |
| `restore()`    | `cover_letter` | `restored`  | `cover_letter_restored`                                                                                                                                                                                                                                                                                 |
| `remove()`     | `cover_letter` | `deleted`   | `cover_letter_deleted`                                                                                                                                                                                                                                                                                  |
| `duplicate()`  | `cover_letter` | `created`   | `cover_letter_created` — **not** in the brief's explicit 5-event list, but a direct, disclosed extension of the already-existing generic `'created'` action, mirroring `ResumeVariant.duplicate()`'s exact Phase 3 precedent ("a duplicate is a brand new, independent row — 'created', not 'updated'") |

Exactly the 5 event names named in this phase's brief are covered, plus one consistent, precedented extension for `duplicate()` — zero new `HistoryListener` code required.

## 10. Credits & AI

Identical structural guarantee to Resume Optimization (Phase 7): `CoverLetterService` has no dependency on `CreditService`, `WalletService`, `RefundService`, `ProviderRegistry`, or any `AIProvider` — only on `AiOrchestrationService`. The charge (`feature_pricing.cover_letter`, seeded at 40 credits per `docs/business/1.pricing-strategy.md.txt` — see the still-open seed-script gap in [credit-architecture.md](credit-architecture.md) §5) happens entirely inside `AiOrchestrationService.execute()`'s call to `CreditService.spendAndExecute()`. `duplicate()` and `update()` never call `AiOrchestrationService` at all — they cost nothing and touch no ledger.

## 11. Known limitations (disclosed, not fixed this phase)

- **Still `DummyAIProvider` only.** No real provider integration, per the brief.
- **`feature_pricing` seed gap.** `cover_letter` (cost 40) is not seeded in a fresh environment — the e2e suite inserts it manually, same as every prior phase's tests.
- **No formal version lineage.** Regenerated versions of "the same letter" are discoverable only informally (matching `resumeVariantId`/`jobTargetId`, ascending `version`) — there is no parent-link column or "get version history" endpoint, since neither was in this phase's schema or endpoint list.
- **Restore's status reconstruction is a heuristic**, not a stored fact — `generatedByAI` picks between `GENERATED`/`EDITED`, which is correct for the common case but would be wrong if, hypothetically, an AI-generated letter had already been manually edited (status `EDITED`) _before_ being archived — restore would incorrectly revert it to `GENERATED`. Not fixed this phase since `CoverLetterStatus` has no room for a fifth value without changing the brief's exact enum.
- **`AIFeature.COVER_LETTER` was already a reserved enum value since Phase 6** (used as a placeholder feature key in `ai-orchestration.e2e-spec.ts`'s own test doubles). That test file's `TestCoverLetterPromptBuilder`/`FailingTestProvider` registrations are harmless — each e2e spec file compiles its own fresh `PromptRegistry`/`ProviderRegistry` instance via its own `Test.createTestingModule(...).compile()` call, so there is no shared-state collision with this phase's real `CoverLetterPromptBuilder`. Left as-is rather than renamed, to avoid touching an already-comprehensive, already-green Phase 6 test file for a purely cosmetic reason.
- **No frontend UI, no PDF/DOCX export, no streaming** — all explicitly out of scope for this phase.

## 12. Testing

- **Unit** (`apps/api/src/cover-letter/**/*.spec.ts`, 49 tests): repository (every Prisma call shape), service (ownership, ATS-baseline reuse, optimization-summary resolution, the full generate() happy path, generate() failure leaves no row, regenerate()'s new-row-not-update-of-source proof, update()'s EDITED-without-version-bump, duplicate()'s version-1/DRAFT/free-of-charge shape, archive/restore idempotency and status-reconstruction, remove()), controller (thin delegation), parser (throws on every required-field/type violation), prompt builder (renders every required section, deterministic hashing, tone-sensitivity).
- **E2E** (`apps/api/test/cover-letter.e2e-spec.ts`, 15 tests, real Postgres/Redis): full generation against `DummyAIProvider`; optimization-summary inclusion (and cross-user rejection of a foreign `optimizationId`); **Invalid JSON** — a temporary broken test provider proves 422, full refund, and zero rows persisted; **Retry** — a temporary flaky-then-valid test provider proves the default retry policy retries a transient failure and still completes, charging credits exactly once; **Versioning** — `regenerate()` proven to create a second, independent row while the first is byte-for-byte unchanged in Postgres; **Manual edit** — `PUT` proven to never bump version or touch the wallet; **Duplicate** — proven free and independent; **Archive/Restore** — round-trip proven, including idempotency; **Soft delete**; **Ownership** — cross-user 404 on every mutating and reading endpoint; **Admin access** — the service-level bypass, per the established self-service-controller pattern; **History events** — all 5 brief-named event types recorded, including via the archive→restore→delete chain.

## 13. Dependency Diagram

```
Cover Letter → AI Orchestration → AI Provider (DummyAIProvider)
Cover Letter → Resume Variant (reads only)
Cover Letter → Job Target (reads, ownership check only)
Cover Letter → ATS Engine (reads for the prompt's current-score context; never writes)
Cover Letter → Resume Optimization (reads .summary via getOne(), ownership-checked; never writes)
Cover Letter → Credits            (indirectly, only through AI Orchestration)

Never: Cover Letter → CreditService directly
Never: Cover Letter → AIProvider / ProviderRegistry directly
Never: Cover Letter → OpenAI / Claude / Gemini (no such dependency exists anywhere yet)
```
