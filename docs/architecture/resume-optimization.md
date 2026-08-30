# CVLab AI — AI Resume Optimization Engine

Status: **implemented, Phase 7** (2026-08-02). The first real AI feature built on top of [ai-orchestration.md](ai-orchestration.md) (Phase 6) — proves the orchestration engine's contract end-to-end without needing a real AI provider. **`DummyAIProvider` is still the only registered provider** — every "AI-generated" suggestion in this phase is deterministic, derived from a SHA-256 digest of the prompt, never a real model call.

## 1. Why this module exists

Per this phase's brief: Resume Optimization must reuse everything already built — Auth, Credits, AI Orchestration, Resume Variants, ATS Engine, Job Targets — with zero duplicated logic. Every dependency is consumed through its own owning module's public service methods, never through raw Prisma access from here:

```
ResumeOptimizationService
  → ResumeVariantService.getOne() / assertOwnerOrAdmin      (Phase 3, reused unchanged)
  → JobTargetService.getOne()                                (Phase 2B, reused unchanged)
  → AtsAnalysisService.run()                                 (Phase 4, reused unchanged — both for the
                                                                "before" baseline and the automatic
                                                                post-apply re-run)
  → AtsReportRepository.findLatestByVariantId()               (Phase 4, one new read method added)
  → AiOrchestrationService.execute()                          (Phase 6, reused unchanged — this is the
                                                                ONLY path to a provider or the credit ledger)
  → ResumeVariantRepository.applyEdit()                       (Phase 3, extended with an optional
                                                                transaction-client parameter)
```

`ResumeOptimizationService` never calls `CreditService` directly and never calls an `AIProvider` directly — both rules are enforced structurally: the service has no dependency on `CreditService` or `ProviderRegistry` at all, only on `AiOrchestrationService`.

## 2. Main Flow

```
Resume Variant
  ↓
ATS Report (reused if one exists, or run fresh — the "before" baseline)
  ↓
AI Orchestration (AiOrchestrationService.execute())
  ↓
Prompt Builder (ResumeOptimizationPromptBuilder)
  ↓
AI Provider (DummyAIProvider, JSON mode)
  ↓
Optimization Suggestions (parsed, validated, persisted)
  ↓
User chooses suggestions (POST .../apply with suggestionIds[])
  ↓
Apply Suggestions (ResumeSuggestionApplier, inside one transaction)
  ↓
New ATS Report (AtsAnalysisService.run() again, score stored)
```

## 3. Database

Migration `20260802131259_resume_optimization_engine`.

### `resume_optimizations`

| Column                                     | Type                        | Notes                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                       | uuid PK                     |                                                                                                                                                                                                                                                                                                       |
| `user_id`                                  | uuid FK → `users`           |                                                                                                                                                                                                                                                                                                       |
| `resume_variant_id`                        | uuid FK → `resume_variants` |                                                                                                                                                                                                                                                                                                       |
| `job_target_id`                            | uuid FK → `job_targets`     |                                                                                                                                                                                                                                                                                                       |
| `ats_report_id`                            | uuid FK → `ats_reports`     | The "before" baseline — an _existing_ report, reused or freshly run, never created by this table's own write                                                                                                                                                                                          |
| `status`                                   | `OptimizationStatus`        | `PENDING` → `COMPLETED` \| `FAILED` — a real, observable state machine, not a placeholder default (see §5)                                                                                                                                                                                            |
| `credits_used`                             | int, default 0              | Snapshot of what `CreditService.spendAndExecute()` actually charged — never recomputed from `feature_pricing` after the fact                                                                                                                                                                          |
| `before_score`                             | int                         | `ats_reports.overall_score` of the baseline report, copied at creation                                                                                                                                                                                                                                |
| `predicted_score`                          | int, nullable               | AI-estimated score if every suggestion were accepted — set only on `COMPLETED`                                                                                                                                                                                                                        |
| `summary`                                  | text, nullable              | Set only on `COMPLETED`                                                                                                                                                                                                                                                                               |
| `created_at` / `updated_at` / `deleted_at` | timestamps                  | Soft-deleted (unlike `ats_reports`, which is hard-deleted — see [database-overview.md](database-overview.md) §3: an optimization run represents real AI cost/history worth retaining, closer to `credit_transactions` in spirit, whereas a deterministic, free, re-runnable ATS report is disposable) |

### `optimization_suggestions`

| Column                                     | Type                             | Notes                                                                                                                                                                            |
| ------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                       | uuid PK                          |                                                                                                                                                                                  |
| `optimization_id`                          | uuid FK → `resume_optimizations` |                                                                                                                                                                                  |
| `type`                                     | `SuggestionType`                 | KEYWORD \| SUMMARY \| EXPERIENCE \| SKILL \| EDUCATION \| PROJECT \| ACHIEVEMENT \| LANGUAGE \| CERTIFICATION \| GENERAL                                                         |
| `section`                                  | text (not an enum)               | See §7 — a plain string so an AI response naming an unrecognized section can be safely skipped at apply time rather than rejected at parse time or fail a Prisma enum constraint |
| `title` / `description` / `reason`         | text                             | `description` is present per the brief's field list but nothing populates it yet — the AI response contract (§6) doesn't include it                                              |
| `priority`                                 | `SuggestionPriority`             | LOW \| MEDIUM \| HIGH \| CRITICAL                                                                                                                                                |
| `original_text`                            | text, nullable                   | Empty string (never `NULL` in practice) marks "this is a new addition, not a replacement"                                                                                        |
| `suggested_text`                           | text                             |                                                                                                                                                                                  |
| `accepted` / `applied`                     | boolean, default false           | `applied` implies `accepted`, never the reverse — see §7                                                                                                                         |
| `display_order`                            | int                              | Preserves the AI response's own suggestion ordering                                                                                                                              |
| `created_at` / `updated_at` / `deleted_at` | timestamps                       | Soft-deleted, matching the parent                                                                                                                                                |

Both tables' relations are declared in both directions in `schema.prisma` (`User.resumeOptimizations`, `JobTarget.resumeOptimizations`, `ResumeVariant.resumeOptimizations`, `AtsReport.resumeOptimizations`), per Prisma's requirement for a matching back-reference on every `@relation`.

## 4. Module

`apps/api/src/resume-optimization/`:

```
constants(shared with ai-orchestration)/
resume-optimization-prompt-builder.ts   PromptBuilder<ResumeOptimizationPromptInput> implementation
resume-optimization-response.parser.ts  Validates the AI's raw JSON text into typed data
resume-suggestion-applier.ts            Pure, synchronous content-transformation engine
supported-sections.ts                   The 8-section registry shared by the parser/applier/prompt builder
resume-optimization.repository.ts       Only Prisma access for both tables
resume-optimization.service.ts          Orchestrates the full flow (§2)
resume-optimization.controller.ts       5 endpoints (§8)
resume-optimization.module.ts           Registers the PromptBuilder on boot
dto/
  run-optimization.dto.ts
  apply-suggestions.dto.ts
```

## 5. Status lifecycle

`OptimizationStatus` is a genuine state machine, not a decoration: `ResumeOptimizationService.run()` creates the `resume_optimizations` row **before** calling `AiOrchestrationService.execute()`, in status `PENDING`. This is what makes `optimization_started`/`optimization_completed`/`optimization_failed` all reference one real, stable entity id, rather than needing a synthetic placeholder for the "started" event. On success, `ResumeOptimizationRepository.completeWithSuggestions()` transitions the row to `COMPLETED` and nested-creates every suggestion in the same write. On any failure — AI orchestration throwing for any reason, including a malformed response — `markFailed()` transitions it to `FAILED` with no suggestions ever created.

## 6. Prompt Builder

`ResumeOptimizationPromptBuilder` (`AIFeature.RESUME_OPTIMIZATION`, prompt version 1) renders one text prompt containing, per the brief:

- **Resume Variant** — the full `content` JSONB snapshot, inlined as JSON.
- **Job Target** — title, company, seniority, keywords, skills (flagging which are required), languages.
- **ATS Report** — every sub-score plus the overall score.
- **Missing Keywords** / **Missing Skills** — read directly from the ATS report's own `missingKeywords`/`recommendedSkills` fields (Phase 4, reused, never recomputed).
- **Weak Sections** — a small heuristic (`describeWeakSections()`) private to the prompt builder: a section is "weak" if it's an empty/missing array, or (for `summary`) shorter than 20 characters. This is presentational context for the prompt, distinct from and not a replacement for the ATS engine's own `detectEmptySections()`.
- **Current Score** — the ATS report's `overallScore`.
- **Desired output** — an explicit "Respond with JSON ONLY" instruction followed by the exact schema (§ below), so a real future provider has the contract spelled out in-band, not only via `AIExecutionOptions.responseFormat` (which a real provider's API would also receive, but a well-written prompt states the contract textually too, for robustness).

## 7. Expected AI Response & Parser

```json
{
  "summary": "string",
  "predictedScore": 0,
  "suggestions": [
    {
      "type": "SUMMARY",
      "section": "summary",
      "priority": "HIGH",
      "title": "string",
      "reason": "string",
      "originalText": "string (empty for a new addition)",
      "suggestedText": "string"
    }
  ]
}
```

`ResumeOptimizationResponseParser.parse(rawText)` validates, in order: JSON syntax → `summary` is a non-empty string → `predictedScore` is a number in [0, 100] → `suggestions` is a non-empty array → every suggestion has all 7 required fields with the right types and enum membership (`type` ∈ `SuggestionType`, `priority` ∈ `SuggestionPriority`). Any violation throws `InvalidPromptError` (from `ai-orchestration/errors/`), per the brief. `section` is validated only as "a non-empty string" — not restricted to the 8 supported values here — because an unrecognized section is meant to be _safely skippable at apply time_, not a parse-time rejection of an otherwise-well-formed response.

**Where this runs matters:** the parser is invoked twice per `run()` call — once as `AIExecutionOptions.responseValidator` (Phase 7's addition to the orchestration pipeline's step 9, see [ai-orchestration.md](ai-orchestration.md) §4), so a malformed response fails _inside_ `CreditService.spendAndExecute()`'s guarded callback and triggers the exact same automatic refund + `AiRequestTrackingService.fail()` bookkeeping as any other pipeline failure; and once more, on the already-known-valid text, to obtain the actual parsed object for persistence (a second, cheap, pure parse — not a second AI call).

### DummyAIProvider's JSON mode

`ResumeOptimizationService.run()` passes `options: { responseFormat: 'json', responseValidator }` to `AiOrchestrationService.execute()`. `DummyAIProvider.generate()` (extended in Phase 7, see [ai-orchestration.md](ai-orchestration.md) §2) detects `responseFormat === 'json'` and returns a deterministic, generic, syntactically valid JSON object (one `GENERAL`/`summary` suggestion) instead of its usual free-text sentence — deterministic per prompt hash, so the same resume+job-target+ATS-report input always produces the same "AI" suggestion in tests.

## 8. Apply Engine

`ResumeSuggestionApplier.apply(content, suggestions)` — pure, synchronous, no I/O:

- **Update ONLY accepted suggestions.** `ResumeOptimizationService.apply()` filters `optimization.suggestions` down to exactly the ids in the request body's `suggestionIds[]` that aren't already `applied`; only that subset is ever passed to the applier.
- **Never overwrite untouched sections.** The applier `structuredClone()`s the input `content` and only ever writes to `content[sectionKey]` for a section that has an accepted suggestion — every other key, and every other array entry within a touched section, passes through unchanged.
- For the scalar `summary` section, applying replaces `content.summary` outright.
- For the 7 array sections, it looks for an existing entry whose primary text field (§9) contains the suggestion's `originalText`; if found, that field is replaced; if not (including when `originalText` is `""`, meaning "this is a new addition"), a new minimal entry is appended.
- A suggestion whose `section` isn't one of the 8 known keys is **skipped**, not applied — but is still marked `accepted: true` (the user did select it), matching the schema's "applied implies accepted, never the reverse" invariant.

**Everything inside one transaction:** `ResumeOptimizationService.apply()` wraps the resume variant's content write (`ResumeVariantRepository.applyEdit()`, extended in Phase 7 with an optional `Prisma.TransactionClient` parameter, defaulting to the plain `PrismaService` for its Phase 3 call sites) and `ResumeOptimizationRepository.markApplyOutcome()` (marking `accepted`/`applied` on the touched suggestion rows) inside one `prisma.$transaction()`. The two writes commit or roll back together — there is no window where the resume content changed but the suggestion rows still show `applied: false`, or vice versa.

**Emit events:** one `suggestion_applied` history event per successfully applied suggestion id, after the transaction commits.

## 9. Supported Sections

| Brief's name         | `section` value  | `content` key      | Array primary field |
| -------------------- | ---------------- | ------------------ | ------------------- |
| Professional Summary | `summary`        | `summary` (scalar) | —                   |
| Experience           | `experience`     | `workExperiences`  | `description`       |
| Skills               | `skills`         | `skills`           | `name`              |
| Projects             | `projects`       | `projects`         | `description`       |
| Education            | `education`      | `educations`       | `description`       |
| Languages            | `languages`      | `languages`        | `language`          |
| Certifications       | `certifications` | `certificates`     | `title`             |
| Achievements         | `achievements`   | `awards`           | `description`       |

The `content` keys and primary fields mirror `resume-variant-snapshot.util.ts`'s `SECTION_TYPE_TO_CONTENT_KEY` (Phase 3) and each section's own Prisma model fields (`WorkExperience.description`, `Skill.name`, `Certificate.title`, etc.) — never invented independently.

## 10. Events

Reuses the generic `ResumeEntityChangedEvent` (`entityType`, `entityId`, `action`) — no new dedicated event classes, matching the precedent every module except Credits follows. `ResumeEntityAction` was widened (again) with `'started' | 'completed' | 'failed' | 'applied'`. `HistoryListener` composes `eventType` as `${entityType}_${action}`, so:

| Emitted as           | `entityType`   | `action`    | `eventType` written to `history_events` |
| -------------------- | -------------- | ----------- | --------------------------------------- |
| Run starts           | `optimization` | `started`   | `optimization_started`                  |
| Run succeeds         | `optimization` | `completed` | `optimization_completed`                |
| Run fails            | `optimization` | `failed`    | `optimization_failed`                   |
| Suggestion applied   | `suggestion`   | `applied`   | `suggestion_applied`                    |
| Optimization deleted | `optimization` | `deleted`   | `optimization_deleted`                  |

Exactly the 5 event names named in this phase's brief, with zero new listener code — `HistoryListener` needed no changes.

## 11. Credits

`ResumeOptimizationService` has no dependency on `CreditService`, `WalletService`, or `RefundService` — only on `AiOrchestrationService`. The charge (`feature_pricing.resume_optimization`, seeded at 80 credits per `docs/business/1.pricing-strategy.md.txt` — see the still-open seed-script gap in [credit-architecture.md](credit-architecture.md) §5) happens entirely inside `AiOrchestrationService.execute()`'s call to `CreditService.spendAndExecute()`. If anything inside that call throws — including this feature's own `responseValidator` — the automatic refund already documented in [ai-orchestration.md](ai-orchestration.md) §4 fires without this module writing a single line of refund logic.

## 12. AI

`ResumeOptimizationService` has no dependency on `ProviderRegistry`, `ProviderSelector`, or any `AIProvider` — only on `AiOrchestrationService.execute()`, which internally selects `DummyAIProvider` (the only registered provider). Swapping in a real provider later (OpenAI, Claude, Gemini) requires zero changes to this module — per [ai-orchestration.md](ai-orchestration.md) §11, that's purely a `ProviderRegistry` registration change.

## 13. ATS integration

- **Before:** `resolveBeforeReport()` reuses the most recent existing `AtsReport` for the target variant (`AtsReportRepository.findLatestByVariantId()`, new in Phase 7) unless `dto.force` is `true` or none exists yet, in which case it calls `AtsAnalysisService.run()` (Phase 4, unchanged) to produce a fresh one.
- **After:** once `apply()`'s transaction commits, it unconditionally calls `AtsAnalysisService.run()` again — per the brief, "after applying suggestions, automatically execute ATS again, store new score." The new score's storage _is_ the new `ats_reports` row Phase 4 already creates; no new column was added to `resume_optimizations` to duplicate it (`apply()`'s response includes the new report for convenience, but persistence lives in the pre-existing table).

## 14. Ownership

Every service method takes `(requestingUser, targetUserId, ...)` and calls `assertOwnerOrAdmin()` first — the exact same shared utility every prior phase uses, imported unchanged. Every controller endpoint is self-service-only (`user.id` is always both requester and target), matching the established pattern from Phase 2A onward: admin bypass exists at the service layer, proven in this phase's e2e suite via a direct `moduleRef.get(ResumeOptimizationService)` call with an `ADMIN` `RequestUser` and a different `targetUserId` — the same technique `credit-engine.e2e-spec.ts` established for admin-adjacent, controller-inaccessible paths.

## 15. Endpoints

| Method & path                         | Notes                                                                                                                                                                                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /resume-optimization/run`       | Body: `{ resumeVariantId, force? }`. 400 if the variant has no linked job target. Returns the `COMPLETED` optimization with its suggestions, or the request fails with the underlying `AIError` (e.g. `InvalidPromptError` → 422) if the AI step fails.               |
| `GET /resume-optimization`            | Lists the caller's own optimizations, most recent first.                                                                                                                                                                                                              |
| `GET /resume-optimization/:id`        | 404 for another user's optimization or a soft-deleted one.                                                                                                                                                                                                            |
| `POST /resume-optimization/:id/apply` | Body: `{ suggestionIds: string[] }`. 400 if none of the ids belong to this optimization, or if the optimization isn't `COMPLETED`, or if every requested id is already applied. Returns `{ optimization, appliedSuggestionIds, skippedSuggestionIds, newAtsReport }`. |
| `DELETE /resume-optimization/:id`     | Soft delete (`deletedAt`), unlike `DELETE /ats/reports/:id`'s real physical delete — see §3.                                                                                                                                                                          |

All 5 routes require `JwtAuthGuard`, matching every other feature controller.

## 16. Testing

- **Unit** (`apps/api/src/resume-optimization/**/*.spec.ts`, 72 tests): repository (every Prisma call shape, including the tx-aware `markApplyOutcome`), service (ownership, ATS-baseline reuse/force, the full run() happy path with pipeline-order assertions, failure → `markFailed`+`failed` event, apply()'s accepted/already-applied/foreign-id guard rails, transaction + event-per-suggestion, remove()), controller (thin delegation), parser (24 tests — every required field, every type violation, every enum violation, empty-array rejection), prompt builder (renders every required section, weak-section detection, deterministic hashing), suggestion applier (10 tests — scalar replace, array replace, array append, unsupported-section skip, no-mutation-of-input, cross-section isolation, multi-suggestion apply).
- **E2E** (`apps/api/test/resume-optimization.e2e-spec.ts`, 12 tests, real Postgres/Redis): full run against `DummyAIProvider`; ATS-baseline reuse vs. `force`; **Invalid JSON** — a temporary broken test provider (registered under the `"dummy"` key, restored after) proves a malformed response is rejected with 422, the charge is fully refunded, and the row is marked `FAILED`; **Retry** — a temporary flaky-then-valid test provider proves the default retry policy retries a transient failure and still completes successfully, charging credits exactly once; **Apply** — a temporary provider returning a fixed, richer JSON payload proves suggestions are actually written into the resume variant's content, a new ATS report is created, and re-applying the same ids is rejected; **Ownership** — cross-user run/get/apply/delete all 404; **Admin access** — the service-level bypass proven directly, per §14; **Soft delete** — the row survives in Postgres with `deletedAt` set but disappears from list/get; **History events** — all 5 event types from §10 recorded, including the failure path.

## 17. Known limitations (disclosed, not fixed this phase)

- **Still `DummyAIProvider` only.** No real provider integration, per the brief.
- **`feature_pricing` seed gap.** `resume_optimization` (cost 80, per `docs/business/1.pricing-strategy.md.txt`) is not seeded in a fresh environment — the e2e suite inserts it manually, same as every prior phase's tests.
- **`description` on `optimization_suggestions` is always `NULL`.** Present per the brief's schema, but the AI response contract (§7) doesn't produce it — nothing populates it this phase.
- **The applier's "matching entry" search is a simple substring check** on one primary field per section (§9), not a fuzzy or multi-field match. A suggestion whose `originalText` doesn't literally appear in that field gets appended as a new entry rather than merged — acceptable for a deterministic test-provider phase, worth revisiting once a real provider's `originalText` values are less predictable.
- **No frontend UI, no streaming, no caching** — all explicitly out of scope for this phase.

## 18. Dependency Diagram

```
Resume Optimization → AI Orchestration → AI Provider (DummyAIProvider)
Resume Optimization → Resume Variant (reads + one transactional content write)
Resume Optimization → Job Target (reads, ownership check only)
Resume Optimization → ATS Engine (reads for the baseline, writes a new report after apply)
Resume Optimization → Credits            (indirectly, only through AI Orchestration)

Never: Resume Optimization → CreditService directly
Never: Resume Optimization → AIProvider / ProviderRegistry directly
Never: Resume Optimization → OpenAI / Claude / Gemini (no such dependency exists anywhere yet)
```
