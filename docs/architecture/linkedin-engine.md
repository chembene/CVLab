# CVLab AI — LinkedIn / Professional Profile Engine

Status: **implemented, FASE 19 (2026-08-30)**. The fifth real AI feature built on top of [ai-orchestration.md](ai-orchestration.md) (Phase 6), following the exact template [resume-optimization.md](resume-optimization.md) (Phase 7), [cover-letter-engine.md](cover-letter-engine.md) (Phase 8), [interview-engine.md](interview-engine.md) (Phase 9), and [career-advisor-engine.md](career-advisor-engine.md) (FASE 18) established. **No parallel architecture was introduced** — `AiOrchestrationService`, `PromptRegistry`, `CreditService`, `AiRequestTrackingService`, and the existing idempotency mechanism are reused unchanged; the only structural additions are a new `PromptBuilder`/`ResponseParser` pair and one new persistence table. `DummyAIProvider` is still the only registered provider — every generated profile in this phase is deterministic, derived from a SHA-256 digest of the prompt, never a real model call.

## 0. What this phase is, and explicitly is not

This engine turns the user's own CVLab data (Master Resume, experience, education, skills) into polished, professional **content** for a LinkedIn profile — a headline, an "About" section, suggested skills, rewritten experience bullets, and general profile-improvement recommendations. It does **not**: authenticate with LinkedIn (no OAuth), publish anything to LinkedIn, scrape LinkedIn, send messages, or connect with recruiters. There is no real LinkedIn API integration anywhere in this codebase — the feature produces text the user can copy into their own LinkedIn profile by hand. `Profile.linkedin` (a plain URL field, unrelated to this feature — see §3) already existed before this phase and is untouched by it.

## 1. Why this module exists

Per FASE 19's brief: LinkedIn must reuse AI Orchestration, the existing `PromptBuilder`/`PromptRegistry` pattern, the existing credit-charge/refund/idempotency mechanism, and the relevant subset of other modules' own context — with zero direct AI calls and zero direct credit deduction.

```
LinkedInService
  → ProfileService.getForUser()                  (Phase 2A, reused unchanged — optional)
  → MasterResumeService.getForUser()              (Phase 2A, reused unchanged — optional)
  → ResumeSectionsService.list()                  (Phase 2A, reused unchanged — work-experience/
                                                     education/skills only, fetched only when a
                                                     Master Resume exists — see §3)
  → JobTargetService.list()                       (Phase 2B, reused unchanged — optional)
  → AiOrchestrationService.execute()                (Phase 6, reused unchanged — this is the ONLY
                                                     path to a provider or the credit ledger)
```

`LinkedInService` never calls `CreditService` directly and never calls an `AIProvider` directly — both rules are enforced structurally: the service has no dependency on `CreditService` or `ProviderRegistry` at all, only on `AiOrchestrationService`, exactly mirroring every prior feature.

## 2. Main Flow

```
POST /linkedin/profile { targetRole? }
  ↓
LinkedInService.generateProfile()
  1. assertOwnerOrAdmin
  2. buildContext() — reads all 4 optional sources in parallel (Promise.all), never throwing on
     absence; resume sections are fetched only if a Master Resume exists (ResumeSectionsService.list()
     throws NotFoundException otherwise — see §3)
  3. buildContextSnapshot() — a lightweight, persisted summary of which sources were present
     (booleans/counts only — see §4)
  4. AiOrchestrationService.execute({ feature: LINKEDIN, input: { targetRole, context }, … })
     → Validate Request → Load Context → Credit Check → Charge Credits → Build Prompt
       (LinkedInPromptBuilder) → Select Provider/Model → Execute (DummyAIProvider) →
       Validate Response (LinkedInResponseParser) → Store AiRequest → Return
  5. Persist a LinkedInProfile row: targetRole + parsed response + contextSnapshot + creditsCharged +
     aiRequestId
  ↓
GET /linkedin/profile        — the caller's own history, most-recent-first
GET /linkedin/profile/:id    — a single generated profile (404 if it belongs to another user)
```

On any pipeline failure (invalid AI JSON, provider failure after retries, etc.), the same automatic refund `AiOrchestrationService`/`CreditService.spendAndExecute()` already provides to every feature applies unchanged — `LinkedInService` persists nothing when `execute()` throws, mirroring Career Advisor's/Cover Letter's "no PENDING/FAILED row" precedent.

## 3. Context gathering — narrower than Career Advisor by design

Rendered into the prompt in this order, each section entirely omitted — never rendered as an empty/fabricated placeholder — when its data is absent:

1. Professional profile (`Profile`, for name/headline/location)
2. Master Resume (title/summary/career level/years of experience/desired position)
3. Professional experience (`WorkExperience`, including description/achievements — richer than Career Advisor's view, since "experience wording optimization" needs the actual current text to rephrase)
4. Education (`Education`)
5. Skills (`Skill`)
6. Job Targets (optional — used by the model to infer a target role when `targetRole` was not supplied)

This is deliberately **narrower** than `CareerAdviceContext` (FASE 18)'s 8 sources — no Applications, ATS Reports, or Interview history, matching this feature's own briefed input list exactly. A considered-but-declined option: feeding a user's prior `CareerAdvice` rows in as extra context. No precedent exists anywhere in this codebase for one AI feature consuming another's _persisted output_ as prompt input (Cover Letter/Interview only reuse a `summary`/`content` field tied to the _same_ `resumeVariantId`/`jobTargetId`, never a standalone advisory record), and `CareerAdvice` itself derives from the same raw data LinkedIn already reads directly — wiring it in would add coupling without a clear benefit.

`ResumeSectionsService.list()` throws `NotFoundException` when the user has no Master Resume yet, so `LinkedInService` only calls it when `MasterResumeService.getForUser()` returned a row — the same real branch `CareerAdvisorService` already has in its otherwise fully-parallel, fully-optional context build.

The prompt itself instructs the model: never invent facts, qualifications, employers, or achievements not present in the data given (rephrasing existing wording is fine, adding new claims is not); write in a professional first-person LinkedIn tone; when data is sparse or absent, say so in the `recommendations` field and still produce the best possible general content — never fabricate to fill a gap.

## 4. Persistence — why a new table, and what it does and doesn't store

**Decision (approved before implementation):** a new `LinkedInProfile` table was required, for the same reason established in FASE 18: `AiRequest` (`ai_requests`) tracks technical/billing metadata only (tokens, cost, status, prompt hash) and has no field for the actual generated text. The explicitly-required `GET /linkedin/profile`/`GET /linkedin/profile/:id` endpoints need somewhere real to read from.

```prisma
model LinkedInProfile {
  id                    String   @id @default(uuid())
  userId                String
  targetRole            String?
  headline              String
  about                 String
  skills                String[]
  experienceSuggestions String[]
  recommendations       String[]
  contextSnapshot       Json?
  creditsUsed           Int      @default(0)
  aiRequestId           String?
  createdAt             DateTime @default(now())
}
```

`contextSnapshot` is a **lightweight summary only** — booleans/counts of which sources contributed (`hasProfile`, `hasMasterResume`, `workExperienceCount`, `educationCount`, `skillsCount`, `jobTargetsCount`), never the underlying resume/job-target content itself, which already lives in, and can always be re-read from, its own source-of-truth tables. `aiRequestId` is a loose pointer (not a foreign key), matching this schema's existing cross-reference style.

Migration: `20260830124237_linkedin_engine`, purely additive — one new table, one new `User.linkedInProfiles` relation. No existing table or column was touched. No soft-delete column — same immutable-record rationale as `CareerAdvice` (no update/delete endpoint exists; each generation is its own row).

## 5. Pricing

`AIFeature.LINKEDIN = 'linkedin'` — **30 credits**, approved by the user during this phase's decision checkpoint. Unlike Career Advisor (whose "15" test-fixture value at least existed as filler data before FASE 18), `AIFeature.LINKEDIN` had **zero usage anywhere in the codebase** prior to this phase — confirmed by exhaustive grep across `apps/api/src` and `apps/api/test`. No price was silently inherited or invented. See [credit-architecture.md](credit-architecture.md) §5 for the authoritative pricing table.

`feature_pricing` has no general seed mechanism yet (a known, pre-existing gap — see `prisma/seed-templates.ts`'s own doc comment); populating the real row for `linkedin` in a given environment is Phase 12 (Admin Dashboard) scope, same as every other feature's price today. `linkedin.e2e-spec.ts` creates and tears down its own temporary `feature_pricing` row, exactly like `career-advisor.e2e-spec.ts`'s established precedent.

## 6. Response format

Structured JSON, validated by `LinkedInResponseParser` — the same `responseValidator`-based pattern `CareerAdvisorResponseParser`/`CoverLetterResponseParser` already established (any throw here triggers the same automatic credit refund as any other pipeline failure):

```json
{
  "headline": "string",
  "about": "string",
  "skills": ["string", "…"],
  "experienceSuggestions": ["string", "…"],
  "recommendations": ["string", "…"]
}
```

Empty arrays are valid (the sparse-data case) — only a missing/non-array field, or a non-string/empty-string array item, is rejected. `DummyAIProvider`'s shared JSON envelope (`ai-orchestration/providers/dummy-ai-provider.ts`) was extended with 4 new fields (`headline`, `about`, `skills`, `experienceSuggestions`); `recommendations` already existed in the envelope from Career Advisor and is reused as-is (same field name, same `string[]` shape).

## 7. Frontend

`app/dashboard/linkedin/page.tsx` — one page: an optional target-role text input, a live credit-cost indicator (via `POST /credits/estimate`, never hardcoded — reuses the existing `useCreditEstimate()` hook from `lib/api/career-advisor.ts` rather than duplicating it), a "Gerar perfil" button with a loading state, the structured response rendered as headline/About/skills (as badges)/experience suggestions/recommendations, and a history list below (`GET /linkedin/profile`). `lib/api/linkedin.ts` exposes `useLinkedInProfileHistory()` and `useGenerateLinkedInProfile()` (invalidates the profile-history and credit-estimate/wallet caches on success, refreshing the displayed balance). No new reusable component was introduced where an equivalent (`PageHeader`, `EmptyState`, `ErrorState`, `Card`, `Badge`, `Input`) already existed. Unlike Career Advisor, there is no mandatory free-text field to fill before generating — the target role is optional, so the "Gerar perfil" button is only disabled on insufficient balance, not on empty input.

## 8. Ownership and API surface

`POST /linkedin/profile`, `GET /linkedin/profile`, `GET /linkedin/profile/:id` — self-service only (the caller is always both requester and target), with the same `assertOwnerOrAdmin` + 404-not-403 IDOR-safe pattern used everywhere else in this codebase. Admin bypass works via the same service-level pattern already established (`LinkedInService.getOne()` accepts an admin `RequestUser` for a different `targetUserId`), never a separate admin route.

## 9. Idempotency

`AiRequest.idempotencyKey` / `CreditTransaction.idempotencyKey` are reused exactly as implemented — no parallel mechanism. `LinkedInService` generates a fresh `linkedin:${userId}:${randomUUID()}` key per call, matching Career Advisor's/Cover Letter's precedent (every "generate" action is meant to always execute, so a fresh key is correct here — the shared mechanism itself, proven generically in `ai-orchestration.e2e-spec.ts` and integration-tested again here, guarantees that a genuinely repeated key never double-charges).

## 10. Security

Authenticated users only (`JwtAuthGuard`); owner-only access enforced at the service layer (`assertOwnerOrAdmin`), never in the controller; cross-user access to `GET /linkedin/profile/:id` returns 404, never 403 or a leaked row; every DTO field is validated (`CreateLinkedInProfileDto.targetRole` — optional string, max length 200).

## 11. Known limitations

- Content generation only — no real LinkedIn API, no OAuth login, no publication, no scraping, no messaging, no recruiter connection automation. All explicitly out of scope for this phase.
- `DummyAIProvider` only — every generated headline/About/skills/suggestions is deterministic placeholder text, not a real AI-authored profile.
- No update/delete endpoint — a generated profile is an immutable record; regenerating creates a new row rather than editing an existing one (same as Career Advisor).
