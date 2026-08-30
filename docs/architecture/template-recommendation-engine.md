# CVLab AI — Template Recommendation Engine

Status: **implemented, FASE 21 (2026-08-30)**. The seventh real AI feature built on top of [ai-orchestration.md](ai-orchestration.md) (Phase 6), following the exact template [career-advisor-engine.md](career-advisor-engine.md) (FASE 18)/[linkedin-engine.md](linkedin-engine.md) (FASE 19)/[ats-ai-engine.md](ats-ai-engine.md) (FASE 20) established. **No parallel architecture was introduced** — `AiOrchestrationService`, `PromptRegistry`, `CreditService`, `AiRequestTrackingService`, and the existing idempotency mechanism are reused unchanged; the only structural additions are a new `PromptBuilder`/`ResponseParser` pair, one new generic prompt utility (`extractEntityIds()` — see §6), and one new persistence table. `DummyAIProvider` is still the only registered provider — every recommendation in this phase is deterministic, derived from a SHA-256 digest of the prompt, never a real model call.

## 0. Template Engine vs. Template Recommendation — the boundary this phase must never cross

CVLab has had a Template Engine since Phase 11 (`apps/api/src/template-engine/`, `ResumeTemplate` catalog + `TemplateEngineService`): it owns the catalog of available résumé templates (name, category, `isATSFriendly`, `premium`, layout metadata) and lets a user attach a chosen template to a Resume Variant or Cover Letter. **This phase never touches that engine.** Template Recommendation is a second, independent feature that reads the existing catalog and the user's own data (Master Resume, an optional Resume Variant, an optional Job Target) and _suggests_ which of the already-existing templates best fit — it never creates, edits, or scores a template's own metadata, and it never applies a template to anything itself.

|                                              | Template Engine (Phase 11)            | Template Recommendation (FASE 21)                                                                                         |
| -------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Owns the template catalog                    | ✅ Yes — the only place that does     | ❌ Never — reads it read-only via `TemplateEngineModule`                                                                  |
| Applies a template to a Variant/Cover Letter | ✅ Yes (`PUT .../template`)           | ❌ Never — the frontend links to that existing flow instead (§8)                                                          |
| Calls AI                                     | ❌ Never                              | ✅ Yes, via `AiOrchestrationService`                                                                                      |
| Costs credits                                | ❌ Free                               | ✅ 20 credits                                                                                                             |
| Output                                       | Template metadata itself              | A ranked shortlist of _existing_ template ids with a score and a reason, referencing the catalog by id only               |
| Persistence                                  | `ResumeTemplate` (`resume_templates`) | `TemplateRecommendation` (`template_recommendations`), nullable FKs to the Resume Variant/Job Target it was generated for |

## 1. Why this module exists

Per FASE 21's brief: Template Recommendation must reuse AI Orchestration, the existing `PromptBuilder`/`PromptRegistry` pattern, the existing credit-charge/refund/idempotency mechanism, and the existing Template Engine catalog — with zero direct AI calls, zero direct credit deduction, and zero duplicated template metadata.

```
TemplateRecommendationService
  → MasterResumeService.getForUser()        (Phase 1B, reused unchanged — optional; absent when
                                               the user hasn't built a Master Resume yet)
  → ResumeSectionsService.list() × 4         (Phase 1B, reused unchanged — work experience/
                                               education/skills/languages, only fetched when a
                                               Master Resume exists)
  → ResumeVariantService.getOne()            (Phase 3, reused unchanged — only when dto.resumeVariantId
                                               is supplied)
  → JobTargetService.getOne()                (Phase 2B, reused unchanged — explicit dto.jobTargetId,
                                               or derived from the Variant's own jobTargetId)
  → TemplateEngineModule (repository read)   (Phase 11, reused unchanged — the full active
                                               ResumeTemplate catalog, read-only)
  → AiOrchestrationService.execute()          (Phase 6, reused unchanged — this is the ONLY path
                                               to a provider or the credit ledger)
```

`TemplateRecommendationService` never calls `CreditService` directly and never calls an `AIProvider` directly — both rules are enforced structurally: the service has no dependency on `CreditService` or `ProviderRegistry` at all, only on `AiOrchestrationService`, exactly mirroring every prior feature.

## 2. Main Flow

```
POST /template-recommendations { resumeVariantId?, jobTargetId? }
  ↓
TemplateRecommendationService.recommend()
  1. assertOwnerOrAdmin
  2. resumeVariantId supplied?  → ResumeVariantService.getOne() — 404s here if it doesn't exist or
     belongs to another user, before any credit is touched
  3. effective Job Target = explicit dto.jobTargetId (if given, takes precedence) — else the
     Variant's own linked jobTargetId (if a Variant was given and has one) — else none
  4. buildContext() — Master Resume + sections (best-effort), Resume Variant title, Job Target
     fields, and the FULL active ResumeTemplate catalog (id/name/category/isATSFriendly/premium)
  5. buildContextSnapshot() — a lightweight, persisted summary (booleans + counts only — see §4)
  6. validTemplateIds = Set of every catalog id just fetched
  7. AiOrchestrationService.execute({ feature: TEMPLATE_RECOMMENDATION, input: { context }, … })
     → Validate Request → Load Context → Credit Check → Charge Credits → Build Prompt
       (TemplateRecommendationPromptBuilder) → Select Provider/Model → Execute (DummyAIProvider) →
       Validate Response (TemplateRecommendationResponseParser + template-id cross-check —
       see §5) → Store AiRequest → Return
  8. Persist a TemplateRecommendation row: resumeVariantId? + jobTargetId? + summary +
     recommendations (re-ranked 1..N, invalid ids dropped) + contextSnapshot + creditsCharged +
     aiRequestId
  ↓
GET /template-recommendations        — the caller's own history, most-recent-first
GET /template-recommendations/:id    — a single recommendation (404 if it belongs to another user)
```

On any pipeline failure (invalid AI JSON, every returned `templateId` fake, provider failure after retries, etc.), the same automatic refund `AiOrchestrationService`/`CreditService.spendAndExecute()` already provides to every feature applies unchanged — `TemplateRecommendationService` persists nothing when `execute()` throws, mirroring Career Advisor's/LinkedIn's/ATS AI's "no PENDING/FAILED row" precedent.

## 3. Context — Master Resume, an optional Variant/Job Target, and the full catalog

`TemplateRecommendationContext` is built from:

1. **Master Resume** (optional) — presence only gates whether sections are fetched at all; when present, work experience/education/skills counts and a `languages[]` list are included, mirroring Career Advisor's/LinkedIn's "counts, not full content" convention.
2. **Resume Variant** (optional) — title only, when `resumeVariantId` was supplied.
3. **Job Target** (optional) — title, company, seniority, employment type, when one is resolved (explicit or derived — see §2 step 3).
4. **The full active `ResumeTemplate` catalog** (always present, never optional) — `{id, name, category, isATSFriendly, premium}` for every active template, embedded verbatim into the prompt as JSON so the model can only choose from real ids (§5, §6).

Unlike ATS AI (nothing optional) and closer to Career Advisor/LinkedIn, most of this context is best-effort and absent-tolerant — a user with no Master Resume, no Variant, and no Job Target can still call this endpoint and receive a recommendation based on the catalog's own metadata (e.g. "start with an ATS-friendly template") plus whatever general guidance the prompt can offer with sparse context.

## 4. Persistence — why a new table, and what it does and doesn't store

**Decision (per the brief, price and table both anticipated up front):** a new `TemplateRecommendation` table was required, for the same reason established in FASE 18/19/20: `AiRequest` (`ai_requests`) tracks technical/billing metadata only and has no field for the actual generated text. The explicitly-required `GET /template-recommendations`/`GET /template-recommendations/:id` endpoints need somewhere real to read from.

```prisma
model TemplateRecommendation {
  id              String   @id @default(uuid())
  userId          String
  resumeVariantId String?  // real FK to ResumeVariant — nullable, see below
  jobTargetId     String?  // real FK to JobTarget — nullable, see below
  summary         String
  recommendations Json     // { templateId, rank, score, reason }[]
  contextSnapshot Json?
  creditsUsed     Int      @default(0)
  aiRequestId     String?
  createdAt       DateTime @default(now())
}
```

Two deliberate departures from `CareerAdvice`/`LinkedInProfile`'s precedent, both justified — and a third point that distinguishes this table from ATS AI's:

- **`resumeVariantId`/`jobTargetId` are real `@relation` FKs, not loose pointers** — same rationale as ATS AI's `atsReportId`: they point at genuine relational data this row is _about_ (which Variant/Job Target the recommendation was generated for), not at a pure audit-log row. Unlike ATS AI's FK, both are **nullable**, because — unlike an `AtsReport`, which cannot exist without both — a Template Recommendation is explicitly allowed to run with neither (§3).
- **`recommendations` is stored as `Json`, not a separate related table** — same rationale as ATS AI's `priorityIssues`/etc.: nothing in this array is ever individually queried or mutated (no per-item accept/apply flow — see §8), so a separate table + repository would be unused complexity.
- **The field is named `recommendations` in the database (matching every prior feature's naming), but `templateRecommendations` in the AI's JSON response contract** — deliberately different names, to avoid a collision inside `DummyAIProvider`'s single shared envelope object, which already has a `recommendations: string[]` field contributed by Career Advisor (§6).

`contextSnapshot` follows the established boolean+count convention: `hasMasterResume`, `hasResumeVariant`, `hasJobTarget`, `workExperienceCount`, `educationCount`, `skillsCount`, `availableTemplatesCount` — never the underlying section content or the full catalog itself, both of which already live in their own tables and can always be re-read.

Migration: `20260830153800_template_recommendation_engine`, purely additive — one new table, one new `User.templateRecommendations` relation, one new `ResumeVariant.templateRecommendations` reverse relation, one new `JobTarget.templateRecommendations` reverse relation. No existing table or column was touched.

## 5. Response format and template-id validation

Structured JSON, validated in two layers:

1. **Shape validation** (`TemplateRecommendationResponseParser`, the same `responseValidator`-based pattern established by `CareerAdvisorResponseParser`/`LinkedInResponseParser`/`AtsAiResponseParser`): `summary` (non-empty string), `templateRecommendations` (non-empty array), and per item — `templateId` (non-empty string), `rank` (number ≥ 1, rounded), `score` (number 0–100, rounded), `reason` (non-empty string). This layer has no knowledge of which template ids actually exist — that's deliberate (§6).
2. **Existence validation** (`TemplateRecommendationService.validateTemplateIds()`, called from inside the `execute()` call's `responseValidator` closure, which has closure access to the `validTemplateIds` set built moments earlier from the real catalog): every returned `templateId` is checked against the real active catalog; ids that don't exist are silently dropped, and the survivors are re-ranked `1..N` in score order. **If zero ids survive, this throws `InvalidPromptError`** — which `AiOrchestrationService.execute()` treats exactly like any other pipeline failure, triggering the same automatic refund, so an unusable recommendation (every template invented or stale) is never persisted and never silently charged.

```json
{
  "summary": "string",
  "templateRecommendations": [
    {
      "templateId": "string (must exist in the catalog)",
      "rank": 1,
      "score": 88,
      "reason": "string"
    }
  ]
}
```

The prompt explicitly instructs: _"You may ONLY recommend templates by an 'id' value taken verbatim from the catalog below — never invent, guess, or slightly-modify an id."_ `DummyAIProvider`'s deterministic response still derives its ids from the prompt itself (via `extractEntityIds()`, §6), so even the placeholder provider always returns real, existing ids in normal operation — the fake-id path is only exercised deliberately, by a test double, in `template-recommendation.e2e-spec.ts`.

## 6. `extractEntityIds()` — a new, genuinely feature-agnostic prompt utility

`DummyAIProvider` must stay feature-agnostic (it doesn't know which feature it's serving — see [ai-orchestration.md](ai-orchestration.md) §9) while still returning _real_ template ids so the happy path exercises genuine end-to-end validation rather than always taking the "invented id, refund" branch. The existing `extractArrayCount()` utility (used by Interview) solves an analogous problem for array _sizes_; this phase adds its counterpart for array _identity_:

```ts
// apps/api/src/ai-orchestration/prompt/entity-id-extraction.util.ts
const ID_FIELD_PATTERN = /"id"\s*:\s*"([^"]+)"/g;

export function extractEntityIds(prompt: string, max = 10): string[] {
  const matches: string[] = [];
  for (const match of prompt.matchAll(ID_FIELD_PATTERN)) {
    if (match[1]) matches.push(match[1]);
  }
  return Array.from(new Set(matches)).slice(0, max);
}
```

It scrapes literal `"id": "value"` JSON key/value pairs out of a prompt that embeds a catalog via `JSON.stringify(items.map(t => ({ id: t.id, ... })))` — used exclusively by `TemplateRecommendationPromptBuilder`'s catalog embedding today. **A deliberate correction made during implementation**: the first version assumed UUID-shaped ids and failed every e2e happy-path test, because `ResumeTemplate.id` values are stable, human-readable slugs (`'modern'`, `'ats-classic'`, etc.) by design — confirmed directly in `resume-templates.seed.ts`'s own doc comment. The final version makes no assumption about id _format_ at all, matching any literal `"id"` field regardless of shape — a strictly more correct, more genuinely generic implementation than the first attempt, and one other future features embedding an id-bearing catalog into a prompt can reuse as-is.

`DummyAIProvider`'s shared JSON envelope gained one new field: `templateRecommendations: extractEntityIds(prompt, 5).map((templateId, i) => ({ templateId, rank: i + 1, score, reason }))`.

## 7. Pricing

`AIFeature.TEMPLATE_RECOMMENDATION = 'template_recommendation'` — **20 credits**, given directly in this phase's brief (no approval round needed, unlike ATS AI's mid-phase correction). `AIFeature.TEMPLATE_RECOMMENDATION` had **zero usage anywhere in the codebase** prior to this phase (confirmed by exhaustive grep). See [credit-architecture.md](credit-architecture.md) §5 for the authoritative pricing table.

`feature_pricing` has no general seed mechanism yet (a known, pre-existing gap); `template-recommendation.e2e-spec.ts` creates and tears down its own temporary `feature_pricing` row, exactly like every prior phase's e2e spec.

## 8. Frontend

A new page, `/dashboard/template-recommendations` — unlike ATS AI (integrated into an existing page), Template Recommendation has no single natural host page, so it gets its own, linked from the sidebar/mobile nav ("Recomendação de Templates," `LayoutTemplate` icon, in the "Candidaturas" group after "Perfil LinkedIn" — see [nav-items.ts](../../apps/web/lib/nav-items.ts)). The page offers an optional Resume Variant selector and an optional Job Target selector, a live credit-cost indicator (via the existing, reused `useCreditEstimate()` hook), and a "Gerar recomendação" button. Once generated, each recommended template renders as a card showing: a `TemplateSwatch` preview and full name/category/ATS/Premium badges — **fetched via the existing `useResumeTemplate(templateId)` hook**, never duplicated from the recommendation response itself (which only carries `templateId`/`rank`/`score`/`reason`, per §5) — plus the rank, a `ScoreBadge`, and the AI's `reason` text. A "Ver este template" button links to the existing Resume Variant → template-selection flow (`/dashboard/resume-variants/:id/template`, falling back to `/dashboard/resume-variants` when no Variant was selected) — **applying a template remains exclusively that existing Phase 11 flow's job**; this page only recommends, it never writes a template choice itself (§0). A history section below lists prior recommendations. `lib/api/template-recommendations.ts` exposes `useTemplateRecommendationHistory()`/`useGenerateTemplateRecommendation()`. Reused components: `PageHeader`, `Card`, `Badge`, `ScoreBadge`, `TemplateSwatch`, `Select`, `EmptyState`, `ErrorState`, `Skeleton` — no new low-level component was introduced beyond the page's own `RecommendedTemplateCard` composition.

## 9. Relation to the Template Engine — recommends, never applies

Template Recommendation produces a ranked shortlist; it never writes to `ResumeVariant.templateId`/`CoverLetter.templateId` or any other template-selection field, and there is no "apply this recommendation" action in this phase (§8) — the user must follow the link to the existing template-selection flow and choose there, the same explicit human step every AI-suggestion feature in this codebase requires (Resume Optimization's `apply`, ATS AI's read-only recommendations).

## 10. Security

Authenticated users only (`JwtAuthGuard`); owner-only access enforced at the service layer (`assertOwnerOrAdmin`), never in the controller; a cross-user or non-existent `resumeVariantId`/`jobTargetId` returns 404 from `ResumeVariantService.getOne()`/`JobTargetService.getOne()` themselves, before any credit is touched — confirmed by dedicated e2e tests asserting zero `CONSUMPTION` transactions in those cases. Every DTO field is validated (`CreateTemplateRecommendationDto.resumeVariantId`/`.jobTargetId` — both optional, non-empty strings when present).

## 11. Idempotency

`AiRequest.idempotencyKey`/`CreditTransaction.idempotencyKey` are reused exactly as implemented — no parallel mechanism. `TemplateRecommendationService` generates a fresh `template-recommendation:${userId}:${randomUUID()}` key per call, matching every prior phase's precedent.

## 12. Known limitations

- Content generation only — the recommendation is deterministic placeholder text/ranking from `DummyAIProvider`, not a real AI-authored judgment.
- No per-item "apply" flow — recommending a template never selects it; the user still chooses via the existing Phase 11 flow (§9).
- No update/delete endpoint — a recommendation is an immutable record; re-generating creates a new row.
- If every AI-returned `templateId` is invalid, the entire call fails and refunds (§5) rather than falling back to a partial or generic recommendation — a deliberate strictness choice, matching this codebase's "never persist unusable AI output" precedent (ATS AI's response validation, Resume Optimization's suggestion-shape validation).
