# CVLab AI — CV Import AI / Intelligent Extraction Engine

Status: **implemented, FASE 22 (2026-08-30)**. The eighth real AI feature built on top of [ai-orchestration.md](ai-orchestration.md) (Phase 6), following the exact template [career-advisor-engine.md](career-advisor-engine.md) (FASE 18)/[linkedin-engine.md](linkedin-engine.md) (FASE 19)/[ats-ai-engine.md](ats-ai-engine.md) (FASE 20)/[template-recommendation-engine.md](template-recommendation-engine.md) (FASE 21) established. **No parallel architecture was introduced** — `AiOrchestrationService`, `PromptRegistry`, `CreditService`, `AiRequestTrackingService`, and the existing idempotency mechanism are reused unchanged; the only structural additions are a new `PromptBuilder`/`ResponseParser` pair, one new field-level validator, and three additive columns on the _existing_ `CvImport` table (never a new table — see §4). `DummyAIProvider` is still the only registered provider — every suggestion in this phase is deterministic, derived from a SHA-256 digest of the prompt, never a real model call. `AIFeature.CV_IMPORT` had been reserved since Phase 10.5 with this exact integration contract already documented in [cv-import.md](cv-import.md) §13f, well before this phase existed.

## 0. Deterministic extraction vs. CV Import AI — the boundary this phase must never cross

CVLab has had a fully deterministic CV Import engine since Phase 10.5 (`CVParser`, `apps/api/src/cv-import/cv-parser.ts`): it extracts personal data, summary, and 9 section types from raw PDF/DOCX text via regex and header-keyword heuristics, computing a per-entry `confidence`/`warnings`/`source` for every entry it produces — no AI anywhere in that module, by deliberate, documented design (cv-import.md §3: "AI must never invent qualifications"). **This phase never touches that engine.** CV Import AI is a second, independent, strictly-downstream layer that reads the already-extracted draft and proposes REVISIONS to fields the parser already populated — normalize a job title, tidy a messy description, separate responsibilities from achievements, flag something genuinely ambiguous — never a new fact for a field the parser left empty.

|                                          | Deterministic Extraction (Phase 10.5)                              | CV Import AI (FASE 22)                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Reads the raw PDF/DOCX text              | ✅ Yes — the only place that does                                  | ❌ Never — never even sees the original file                                                                |
| Produces the personal data / 9 sections  | ✅ Yes — the only source of truth                                  | ❌ Never — reads them read-only from `CvImport.extractedData`                                               |
| Calls AI                                 | ❌ Never                                                           | ✅ Yes, via `AiOrchestrationService`                                                                        |
| Costs credits                            | ❌ Free (`creditsUsed` always 0 for this step)                     | ✅ 30 credits                                                                                               |
| Output                                   | The structured draft itself, with per-entry confidence/warnings    | A list of proposed field REVISIONS + a list of unresolved-field notes — never a new entry, never a new fact |
| Can invent a value for an empty field    | ❌ Never (by design, since Phase 10.5)                             | ❌ Never — structurally enforced, see §5                                                                    |
| Writes to Profile/Master Resume/sections | ❌ Never — only `confirm()` does, and only on explicit user action | ❌ Never — only proposes; the SAME pre-existing `confirm()` is still the only write path                    |
| Persistence                              | `CvImport.extractedData`/`fieldConfidence`                         | `CvImport.aiSuggestions`/`aiUnresolvedFields` — same row, three new additive columns                        |

## 1. Why this module exists

Per FASE 22's brief and cv-import.md §13f's own pre-existing design: CV Import AI must reuse AI Orchestration, the existing `PromptBuilder`/`PromptRegistry` pattern, the existing credit-charge/refund/idempotency mechanism, and the existing deterministic extraction's own real output — with zero direct AI calls, zero direct credit deduction, and zero duplicated parsing/extraction logic.

```
CvImportService.enhanceWithAi()
  → findOwnedOrThrow()                       (pre-existing, reused unchanged — ownership-checked
                                               read of an existing CvImport row; must be EXTRACTED)
  → buildEligibleFields(extractedData)       (cv-import-ai-validator.ts — every already-extracted,
                                               non-empty field, computed once, shared by the prompt
                                               builder AND the post-response validator)
  → AiOrchestrationService.execute()          (Phase 6, reused unchanged — this is the ONLY path
                                               to a provider or the credit ledger)
  → validateCvImportAiSuggestions()           (drops anything the AI returned that doesn't
                                               correspond to a real, non-empty field; always
                                               substitutes the REAL current value, never the AI's
                                               own echo of it)
```

`CvImportService` never calls `CreditService` directly and never calls an `AIProvider` directly — both rules are enforced structurally: the added `AiOrchestrationService` constructor dependency sits alongside its pre-existing, entirely unmodified deterministic dependencies (`CVParser`, `ProfileService`, `MasterResumeService`, `ResumeSectionsService`), exactly mirroring every prior feature.

## 2. Main Flow

```
POST /cv-import/:id/enhance
  ↓
CvImportService.enhanceWithAi()
  1. assertOwnerOrAdmin
  2. findOwnedOrThrow() — 404s here if the id doesn't exist or belongs to another user, before any
     credit is touched. Must be status EXTRACTED (409 otherwise — same guard confirm() itself uses)
  3. AiOrchestrationService.execute({ feature: CV_IMPORT, input: { data: extractedData }, … })
     → Validate Request → Load Context → Credit Check → Charge Credits → Build Prompt
       (CvImportPromptBuilder — embeds the draft + an ELIGIBLE_FIELDS_JSON block) →
       Select Provider/Model → Execute (DummyAIProvider) →
       Validate Response (CvImportResponseParser + real-field cross-check — see §5) →
       Store AiRequest → Return
  4. Persist onto the SAME CvImport row: aiSuggestions (validated, grounded) + aiUnresolvedFields +
     creditsCharged + aiRequestId — status stays EXTRACTED, unchanged
  ↓
The user reviews suggestions in the frontend, accepting/rejecting each one — accepting folds the
suggestedValue into the SAME local review draft the existing edit fields already write to
  ↓
POST /cv-import/:id/confirm    — the pre-existing, entirely unmodified endpoint — still the only
                                  thing that ever writes to Profile/Master Resume/sections
```

On any pipeline failure (invalid AI JSON, provider failure after retries, every suggestion referencing a non-existent field), the same automatic refund `AiOrchestrationService`/`CreditService.spendAndExecute()` already provides to every feature applies unchanged — `CvImportService` persists nothing when `execute()` throws.

## 3. Context — never re-extracted, always exactly what the parser already found

`CvImportPromptInput` is built entirely from data that already exists: `CvImport.extractedData` (the full `ExtractedCvData` — personal data, summary, all 9 section arrays, each entry's own already-computed `confidence`/`warnings`/`source`). Nothing else is gathered — unlike Career Advisor/LinkedIn/Template Recommendation, there is no optional cross-module context here, and unlike ATS AI (which reads a report plus its linked Variant/Job Target), there's no secondary related entity to pull in either. The model never sees the original uploaded file — only the parser's own already-structured output, which is precisely why it can never legitimately claim to know a fact the parser didn't already find.

## 4. Persistence — same row, three new additive columns, no new table

**Decision:** unlike every FASE 18-21 AI feature (each of which created a brand-new table), CV Import AI reuses the _existing_ `CvImport` row. This was the intended design from the start: `CvImport.creditsUsed` has existed since Phase 10.5 specifically for this step (its own doc comment: _"Snapshot of what CreditService.spendAndExecute() actually charged for the AI Extraction step — 0 until that step runs"_), and cv-import.md §13f documented the exact contract in advance. Per PASSO 12's own instruction to prefer reusing an existing model over inventing a new one, three purely additive columns were added:

```prisma
model CvImport {
  // ...unchanged fields...
  aiSuggestions      Json?    @map("ai_suggestions")
  aiUnresolvedFields String[] @default([]) @map("ai_unresolved_fields")
  aiRequestId        String?  @map("ai_request_id")
}
```

- **`aiSuggestions`** — `CvImportAiSuggestion[]` (`{ section, index?, field, originalValue, suggestedValue, reason, confidence }`), stored as `Json`, not a separate related table — same rationale as ATS AI's/Template Recommendation's recommendation arrays: nothing here is ever individually queried or mutated server-side (accept/reject happens entirely client-side, folded into the next `confirm()` call — see §9).
- **`aiUnresolvedFields`** — plain `String[]`, human-readable notes on fields the AI couldn't confidently improve. `@default([])` (not nullable) so a pre-FASE-22 row and a row that's never been enhanced both read back a genuinely empty array, never `null`.
- **`aiRequestId`** — loose pointer to the matching `AiRequest` row, never a FK, same convention as every other feature's `aiRequestId`.

Migration `20260830171627_cv_import_ai_engine`, purely additive — no existing column, index, or table was touched. `status` is deliberately left unchanged by `enhanceWithAi()` (stays `EXTRACTED`) — this is an optional, repeatable enrichment step, not a pipeline stage transition.

## 5. Response format and the "never invent" enforcement

Structured JSON, validated in two layers — mirroring Template Recommendation's (FASE 21) two-layer "shape, then ground truth" pattern:

1. **Shape validation** (`CvImportResponseParser`, the same `responseValidator`-based pattern established by every prior feature's parser): each suggestion needs a valid `section`, an optional non-negative `index`, a non-empty `field`/`suggestedValue`/`reason`, and a `confidence` in `[0, 1]`. This layer has no knowledge of which fields actually exist in a given draft.
2. **Grounding validation** (`validateCvImportAiSuggestions()` in `cv-import-ai-validator.ts`, called from inside the `execute()` call's `responseValidator` closure): every suggestion's `section`/`index`/`field` is looked up against the REAL `ExtractedCvData` via `getFieldValue()` — the same function `buildEligibleFields()` uses to compute what the prompt tells the model it may touch in the first place, so there is exactly one source of truth for "what's a real field" shared by both the prompt and the validator. A suggestion targeting a non-existent or currently-empty field is silently dropped; the survivor's `originalValue` is always overwritten with the real current value, never the AI's own echo of it. **If the AI returned at least one suggestion but every single one is invalid, the whole call throws `InvalidPromptError`** — triggering the same automatic refund every other pipeline failure uses, so a genuinely hallucinating response is never silently accepted as "nothing to suggest."

```json
{
  "fieldSuggestions": [
    {
      "section": "workExperiences",
      "index": 0,
      "field": "position",
      "originalValue": "…",
      "suggestedValue": "…",
      "reason": "…",
      "confidence": 0.8
    }
  ],
  "unresolvedFields": ["…"]
}
```

**Why the wire field is `fieldSuggestions`, not `suggestions`**: `DummyAIProvider`'s single shared JSON envelope already has a differently-shaped `suggestions` field (Resume Optimization's `{type, section, priority, title, reason, originalText, suggestedText}`). Reusing that name would have silently collided — the exact same naming-collision-avoidance precedent Template Recommendation (FASE 21) established for its own `templateRecommendations` field. The parsed, internal result type (and this feature's own persisted column/frontend type) are free to use the clearer name `suggestions`/`aiSuggestions` since the collision only exists at the shared-envelope wire level.

`DummyAIProvider` gained a matching capability, `extractCvImportEligibleFields()` — scrapes the literal `ELIGIBLE_FIELDS_JSON: [...]` marker `CvImportPromptBuilder` embeds in its own prompt, mirroring `extractEntityIds()`'s (FASE 21) "read a JSON blob the feature's own PromptBuilder already computed and embedded" philosophy against a richer per-field shape instead of a flat id list — so the dummy response's suggestions always target real fields and exercise the happy path genuinely, not just the refund branch.

## 6. Confidence — reused, not reinvented

Per this phase's own audit requirement: a per-entry confidence mechanism already existed in this module since Phase 10.5 (`CvDraftMeta.confidence`, a 0–1 score computed by `CVParser`) and a frontend HIGH/MEDIUM/LOW bucketing already existed (`getEntryConfidenceTier()` in `lib/cv-import/confidence.ts`, thresholds ≥0.8/≥0.5). CV Import AI reuses both unchanged: each `CvImportAiSuggestion.confidence` is a 0–1 number using the exact same scale, and the frontend renders it through the SAME `getEntryConfidenceTier()` function, not a new mechanism. No new confidence concept was introduced anywhere in this phase.

## 7. Pricing

`AIFeature.CV_IMPORT = 'cv_import'` — **30 credits**, approved by the user during this phase's mandatory decision checkpoint (per PASSO 6 — no price for this feature had ever been documented or approved anywhere in the codebase prior to this phase; every existing mention explicitly said pricing was a deliberately deferred product decision). 30 credits matches Career Advisor/LinkedIn/ATS AI — the same "interpretation/normalization of already-available data" category, rather than a heavier full-content generation task like Resume Optimization (80) or Cover Letter (40). The deterministic extraction itself remains free, unchanged — see [credit-architecture.md](credit-architecture.md) §5 for the authoritative pricing table.

`feature_pricing` has no general seed mechanism yet (a known, pre-existing gap); `cv-import-ai.e2e-spec.ts` creates and tears down its own temporary `feature_pricing` row, exactly like every prior phase's e2e spec.

## 8. Frontend

Integrated directly into the existing `/dashboard/import-cv` review screen — **no second import experience**, per this phase's own "preserve CV Import" rule. A new, self-contained `CvImportAiSuggestions` component renders alongside (never inside) the pre-existing, unmodified `CvImportReview` component, so the already-tested 900-line review component needed zero changes. Before enhancement runs: a "Melhorar com IA" button with its live credit cost (via the existing, reused `useCreditEstimate()` hook — never hardcoded) and an insufficient-balance warning. Once suggestions exist: each one renders with a confidence badge (reusing `getEntryConfidenceTier()`), the original value struck through and the suggested value in success-green (the same visual convention Resume Optimization's own suggestion cards already use), a reason, and explicit Aceitar/Rejeitar buttons. Accepting a suggestion calls a small pure function, `applyCvImportAiSuggestion()`, that folds the `suggestedValue` into the page's existing `reviewData` state — the exact same state the user's own manual edits already write to — so the pre-existing, unmodified `confirm()` call is still the only thing that ever reaches the Master Resume. `lib/api/cv-import.ts` adds `useEnhanceCvImportWithAi()` following the same shape as every other feature's generate hook.

## 9. Relation to `confirm()` — proposes, never writes

This is the clearest instance yet of "AI proposes, the user decides, the pre-existing write path is untouched": `enhanceWithAi()` has no write access to Profile/Master Resume/sections at all — it only updates `CvImport.aiSuggestions`/`aiUnresolvedFields` on the same staging row. `confirm()` required zero backend changes for this phase, because it already accepted a fully user-edited draft back (`ConfirmCvImportDto`'s per-field overrides, in place since Phase 12) — accepting an AI suggestion is, from `confirm()`'s point of view, indistinguishable from the user having typed the revised value in by hand.

## 10. Security

Authenticated users only (`JwtAuthGuard`); owner-only access enforced at the service layer (`assertOwnerOrAdmin`), never in the controller; a cross-user or non-existent `cvImportId` returns 404 from `findOwnedOrThrow()` itself, before any credit is touched — confirmed by dedicated e2e tests asserting zero `CONSUMPTION` transactions in those cases. Running enhancement on an already-`CONFIRMED`/`DISCARDED` import is rejected with 409.

## 11. Idempotency

`AiRequest.idempotencyKey`/`CreditTransaction.idempotencyKey` are reused exactly as implemented — no parallel mechanism. `CvImportService` generates a fresh `cv-import-ai:${userId}:${randomUUID()}` key per call, matching every prior phase's precedent.

## 12. Known limitations

- Content generation only — the suggestions are deterministic placeholder text from `DummyAIProvider`, not a real AI-authored revision.
- No per-suggestion server-side accept/apply record — acceptance is entirely client-side (folded into the next `confirm()` payload); there is no audit trail of which individual suggestions a user accepted versus rejected, only the final confirmed draft.
- `enhanceWithAi()` can be called multiple times on the same `EXTRACTED` row (each call charges again and overwrites the previous `aiSuggestions`) — there is no cap or cooldown in this phase.
- If every AI-returned suggestion is invalid, the entire call fails and refunds (§5) rather than falling back to a partial or generic result — the same deliberate strictness precedent as Template Recommendation.
