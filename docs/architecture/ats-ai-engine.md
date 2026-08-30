# CVLab AI — ATS AI Engine

Status: **implemented, FASE 20 (2026-08-30)**. The sixth real AI feature built on top of [ai-orchestration.md](ai-orchestration.md) (Phase 6), following the exact template [career-advisor-engine.md](career-advisor-engine.md) (FASE 18)/[linkedin-engine.md](linkedin-engine.md) (FASE 19) established. **No parallel architecture was introduced** — `AiOrchestrationService`, `PromptRegistry`, `CreditService`, `AiRequestTrackingService`, and the existing idempotency mechanism are reused unchanged; the only structural additions are a new `PromptBuilder`/`ResponseParser` pair and one new persistence table. `DummyAIProvider` is still the only registered provider — every interpretation in this phase is deterministic, derived from a SHA-256 digest of the prompt, never a real model call.

## 0. ATS deterministic vs. ATS AI — the boundary this phase must never cross

CVLab has had a fully deterministic ATS engine since Phase 4 (`AtsAnalysisService`, `apps/api/src/ats/`): it parses a Resume Variant against its linked Job Target, computes 7 sub-scores (keyword/skills/experience/education/language/formatting/completion) via pure, rule-based functions in `ats-scoring.util.ts`, and persists one `AtsReport` row per run. **This phase never touches that engine.** ATS AI is a second, independent feature that reads an already-computed `AtsReport` and _interprets_ it — explains what the numbers mean, prioritizes what to fix, and produces an action plan. It never recomputes a score, never re-matches a keyword or skill, and never re-detects a formatting/empty-section issue. If the deterministic engine's output changes (e.g. its weighting formula is tuned later), ATS AI automatically reflects that on the next report it reads — there is exactly one source of truth for every number.

|                         | ATS Analysis (Phase 4)                                                              | ATS AI (FASE 20)                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Computes scores/matches | ✅ Yes — the only place that does                                                   | ❌ Never — reads them from `AtsReport`                                                                  |
| Calls AI                | ❌ Never                                                                            | ✅ Yes, via `AiOrchestrationService`                                                                    |
| Costs credits           | ❌ Free                                                                             | ✅ 30 credits                                                                                           |
| Output                  | Numbers + rule-based `recommendations[]` (fixed strings from `ats-scoring.util.ts`) | Prose interpretation: assessment, prioritized issues, category-specific recommendations, an action plan |
| Persistence             | `AtsReport` (`ats_reports`)                                                         | `AtsAiAnalysis` (`ats_ai_analyses`), FK to the `AtsReport` it explains                                  |

## 1. Why this module exists

Per FASE 20's brief: ATS AI must reuse AI Orchestration, the existing `PromptBuilder`/`PromptRegistry` pattern, the existing credit-charge/refund/idempotency mechanism, and the deterministic ATS engine's own already-computed output — with zero direct AI calls, zero direct credit deduction, and zero duplicated scoring/matching logic.

```
AtsAiService
  → AtsAnalysisService.getOne()                   (Phase 4, reused unchanged — ownership-checked
                                                     read of an existing AtsReport; never a raw
                                                     repository read, never recomputed)
  → ResumeVariantService.getOne()                  (Phase 3, reused unchanged — via the report's
                                                     own resumeVariantId)
  → JobTargetService.getOne()                      (Phase 2B, reused unchanged — via the report's
                                                     own jobTargetId)
  → AiOrchestrationService.execute()                (Phase 6, reused unchanged — this is the ONLY
                                                     path to a provider or the credit ledger)
```

`AtsAiService` never calls `CreditService` directly and never calls an `AIProvider` directly — both rules are enforced structurally: the service has no dependency on `CreditService` or `ProviderRegistry` at all, only on `AiOrchestrationService`, exactly mirroring every prior feature.

## 2. Main Flow

```
POST /ats-ai/analyze { atsReportId }
  ↓
AtsAiService.analyze()
  1. assertOwnerOrAdmin
  2. AtsAnalysisService.getOne() — 404s here if atsReportId doesn't exist or belongs to another
     user, before any credit is touched
  3. buildContext() — reads the report's own persisted fields verbatim (no recalculation), plus
     its already-linked Resume Variant/Job Target (both guaranteed to exist — see §3)
  4. buildContextSnapshot() — a lightweight, persisted summary (counts only — see §4)
  5. AiOrchestrationService.execute({ feature: ATS_AI, input: { context }, … })
     → Validate Request → Load Context → Credit Check → Charge Credits → Build Prompt
       (AtsAiPromptBuilder) → Select Provider/Model → Execute (DummyAIProvider) →
       Validate Response (AtsAiResponseParser) → Store AiRequest → Return
  6. Persist an AtsAiAnalysis row: atsReportId + parsed interpretation + contextSnapshot +
     creditsCharged + aiRequestId
  ↓
GET /ats-ai/analyses        — the caller's own history, most-recent-first
GET /ats-ai/analyses/:id    — a single analysis (404 if it belongs to another user)
```

On any pipeline failure (invalid AI JSON, provider failure after retries, etc.), the same automatic refund `AiOrchestrationService`/`CreditService.spendAndExecute()` already provides to every feature applies unchanged — `AtsAiService` persists nothing when `execute()` throws, mirroring Career Advisor's/LinkedIn's "no PENDING/FAILED row" precedent. Confirmed by a dedicated e2e assertion: the underlying `AtsReport` row is read before and after an AI analysis and found byte-for-byte unchanged.

## 3. Context — never recomputed, always fully present

`AtsAiContext` is built entirely from data that already exists:

1. **AtsReport's own persisted fields** — all 7 scores, `matchedKeywords`, `missingKeywords`, `recommendedSkills`, and the rule-based `recommendations[]` already generated by Phase 4 — read verbatim, never recalculated.
2. **Job Target** — title, company, seniority, keywords, skills, languages.
3. **Résumé** — title only (never the full content JSON blob — rewriting résumé wording is Resume Optimization's job, not this one's; see §8).

Unlike Career Advisor (8 optional modules) and LinkedIn (4 optional modules), **nothing here is optional**. `AtsReport.resumeVariantId`/`jobTargetId` are non-nullable columns — `AtsAnalysisService.run()` cannot even create a report without both — so a report's Resume Variant and Job Target are guaranteed to exist at read time (modulo the same "resource soft-deleted since" risk every other feature that re-references a stored id already carries, e.g. Cover Letter's `optimizationId`/Interview's `coverLetterId` — not a new gap introduced here).

**A deliberate simplification versus the brief's suggested input list**: "section findings" and "formatting findings" are not persisted anywhere as raw lists — `AtsAnalysisService.run()` computes them internally (`detectFormattingProblems()`/`detectEmptySections()`) but only folds the result into `formattingScore`; the finding lists themselves are discarded. ATS AI does not re-run those functions to recover them (that would mean re-fetching the Resume Variant's full content and re-executing part of the deterministic engine a second time, purely to reconstruct data that was always meant to be a numeric score, not a persisted list). The `formattingScore` number itself carries the signal; the model is asked to interpret _why_ a low score matters, not fed a synthetic "list" a second computation invented.

## 4. Persistence — why a new table, and what it does and doesn't store

**Decision (approved before implementation):** a new `AtsAiAnalysis` table was required, for the same reason established in FASE 18/19: `AiRequest` (`ai_requests`) tracks technical/billing metadata only and has no field for the actual generated text. The explicitly-required `GET /ats-ai/analyses`/`GET /ats-ai/analyses/:id` endpoints, plus "compare analyses over time for the same report," need somewhere real to read from.

```prisma
model AtsAiAnalysis {
  id                     String   @id @default(uuid())
  userId                 String
  atsReportId            String   // real FK to AtsReport — see below
  overallAssessment      String
  strengths              String[]
  priorityIssues         Json     // { priority, category, explanation, recommendation }[]
  contentRecommendations Json
  sectionRecommendations Json
  actionPlan             String[]
  contextSnapshot        Json?
  creditsUsed            Int      @default(0)
  aiRequestId            String?
  createdAt              DateTime @default(now())
}
```

Two deliberate departures from `CareerAdvice`/`LinkedInProfile`'s precedent, both justified:

- **`atsReportId` is a real `@relation` FK**, not a loose pointer. Unlike `aiRequestId` (which points at a pure audit-log row with no relational integrity need), the `AtsReport` being interpreted is genuine relational data this row is _about_ — a real FK lets "every AI analysis for this report" be a simple, indexed join, and prevents an analysis ever pointing at a report that doesn't exist.
- **`priorityIssues`/`contentRecommendations`/`sectionRecommendations` are stored as `Json`, not a separate related table** (unlike `OptimizationSuggestion`, which _is_ a separate table). The difference: `OptimizationSuggestion` rows are individually mutated (`accepted`/`applied` flags, set when a user applies one). Nothing in ATS AI's output is ever individually queried or mutated — no per-item accept/apply flow exists in this phase (see §8) — so each array is immutable, read-only content tied 1:1 to its one analysis. A separate table + repository for that would be unused complexity, not real normalization.

`contextSnapshot` is a lightweight summary only — 3 counts (`matchedKeywordsCount`, `missingKeywordsCount`, `recommendedSkillsCount`), never the underlying keyword/skill lists themselves, which already live in the `AtsReport` row and can always be re-read. No `hasJobTarget`/`hasResume` booleans, unlike `CareerAdviceContextSnapshot`/`LinkedInProfileContextSnapshot` — both are always true for ATS AI (§3), so a boolean that never varies would carry no information.

Migration: `20260830131600_ats_ai_engine`, purely additive — one new table, one new `User.atsAiAnalyses` relation, one new `AtsReport.atsAiAnalyses` reverse relation. No existing table or column was touched.

## 5. Pricing

`AIFeature.ATS_AI = 'ats_ai'` — **30 credits**, approved by the user during this phase's decision checkpoint (an initial 20-credit proposal was superseded by this explicit final decision, matching Career Advisor/LinkedIn exactly — the user's own reasoning: ATS AI is "uma camada adicional de interpretação/recomendação inteligente" of the same category as those two, not a lighter-weight operation). `AIFeature.ATS_AI` had **zero usage anywhere in the codebase** prior to this phase (confirmed by exhaustive grep) — its own doc comment in `ai-feature.enum.ts` had anticipated exactly this feature since Phase 6 ("the future AI-assisted ATS suggestion feature... not a replacement for the rule-based one"), but no price was ever attached. ATS Analysis itself (the deterministic engine) remains free, unchanged. See [credit-architecture.md](credit-architecture.md) §5 for the authoritative pricing table.

`feature_pricing` has no general seed mechanism yet (a known, pre-existing gap); `ats-ai.e2e-spec.ts` creates and tears down its own temporary `feature_pricing` row, exactly like `career-advisor.e2e-spec.ts`'s/`linkedin.e2e-spec.ts`'s established precedent.

## 6. Response format

Structured JSON, validated by `AtsAiResponseParser` — the same `responseValidator`-based pattern established by `CareerAdvisorResponseParser`/`LinkedInResponseParser`, plus per-item validation for the 3 recommendation arrays modeled on `ResumeOptimizationResponseParser`'s `suggestions[]` handling (including reusing the exact same `SuggestionPriority` enum/vocabulary — `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` — rather than inventing a parallel one):

```json
{
  "overallAssessment": "string",
  "strengths": ["string", "…"],
  "priorityIssues": [
    {
      "priority": "LOW|MEDIUM|HIGH|CRITICAL",
      "category": "string",
      "explanation": "string",
      "recommendation": "string"
    }
  ],
  "contentRecommendations": [/* same item shape */],
  "sectionRecommendations": [/* same item shape */],
  "actionPlan": ["string", "…"]
}
```

**A deliberate departure from the brief's suggested shape**: the brief's proposed output included flat `missingKeywords`/`skillGaps` arrays. Those were dropped — echoing `AtsReport.missingKeywords`/`recommendedSkills` back as a second, AI-generated copy would duplicate data the deterministic report already owns and the frontend already renders on the same page (`/dashboard/ats-reports/:id`). Instead, `priorityIssues`/`contentRecommendations` reference specific keywords/skills by name within their own `explanation`/`recommendation` text — the interpretation stays grounded in the real data without a second, potentially-inconsistent list existing alongside it.

Empty arrays are valid (the low-score/sparse-data case) — only a missing/non-array field, a malformed recommendation object, or an invalid `priority` value, is rejected. `DummyAIProvider`'s shared JSON envelope was extended with 5 new fields; `strengths` already existed (from Career Advisor) and is reused as-is.

## 7. Frontend

No new page — per the brief's explicit "não criar uma segunda experiência ATS," ATS AI is integrated directly into the existing `/dashboard/ats-reports/[id]` detail page as a new "Interpretação com IA" card. When no analysis exists yet for this report, it shows a live credit-cost indicator (via the existing, reused `useCreditEstimate()` hook) and an "Analisar com IA" button; once generated, the same card renders the overall assessment, strengths, prioritized issues (each with `PriorityBadge` — reused as-is, not a new badge), content/section recommendations, and an ordered action plan. `lib/api/ats-ai.ts` exposes `useAtsAiAnalyses()`/`useAnalyzeWithAi()`; the detail page cross-references the user's full analysis history down to the one matching this `atsReportId` client-side (no backend filter param was added), the same pattern already established for Career Advisor/Application Tracker. Reused components: `PageHeader`, `Card`, `Badge`, `Alert`/`AlertTitle`/`AlertDescription`, `EmptyState`, `ErrorState`, `Skeleton`, `ScoreBadge`, `PriorityBadge` — no new component was introduced.

## 8. Relation to Resume Optimization — recommends, never edits

ATS AI produces recommendations; it never touches the Resume Variant, and there is no per-item "apply" action in this phase (unlike `ResumeOptimizationService.apply()`, which does write accepted suggestions into a Variant's content). If a future phase wires ATS AI's recommendations into Resume Optimization, the flow the brief specifies is: `ATS AI recommendation → user approval → Resume Optimization/Variant` — the same explicit human-approval step Resume Optimization's own suggestions already require. Not implemented in this phase.

## 9. Relation to Job Target

Every `AtsAiAnalysis` is generated against a Job Target — structurally guaranteed, not optional (§3), since `AtsReport.jobTargetId` is non-nullable. The "no Job Target" branch the brief anticipates cannot occur for this feature: an `AtsReport` can never exist without one.

## 10. Security

Authenticated users only (`JwtAuthGuard`); owner-only access enforced at the service layer (`assertOwnerOrAdmin`), never in the controller; a cross-user or non-existent `atsReportId` returns 404 from `AtsAnalysisService.getOne()` itself, before any credit is touched — confirmed by a dedicated e2e test asserting zero `CONSUMPTION` transactions in that case. Every DTO field is validated (`CreateAtsAiAnalysisDto.atsReportId` — required, non-empty string).

## 11. Idempotency

`AiRequest.idempotencyKey`/`CreditTransaction.idempotencyKey` are reused exactly as implemented — no parallel mechanism. `AtsAiService` generates a fresh `ats-ai:${userId}:${randomUUID()}` key per call, matching Career Advisor's/LinkedIn's precedent.

## 12. Known limitations

- Content generation only — the interpretation is deterministic placeholder text from `DummyAIProvider`, not a real AI-authored assessment.
- No per-item accept/apply flow — recommendations are read-only in this phase (§8).
- No update/delete endpoint — an analysis is an immutable record; re-analyzing the same report creates a new row.
