# CVLab AI — Career Advisor Engine

Status: **implemented, FASE 18 (2026-08-27)**. The fourth real AI feature built on top of [ai-orchestration.md](ai-orchestration.md) (Phase 6), following the exact template [resume-optimization.md](resume-optimization.md) (Phase 7), [cover-letter-engine.md](cover-letter-engine.md) (Phase 8), and [interview-engine.md](interview-engine.md) (Phase 9) established. **No parallel architecture was introduced** — `AiOrchestrationService`, `PromptRegistry`, `CreditService`, `AiRequestTrackingService`, and the existing idempotency mechanism are reused unchanged; the only structural addition is a new `PromptBuilder`/`ResponseParser` pair and one new persistence table. `DummyAIProvider` is still the only registered provider — every recommendation in this phase is deterministic, derived from a SHA-256 digest of the prompt, never a real model call.

## 0. What makes this feature different

Every prior AI feature (Resume Optimization, Cover Letter, Interview) requires a specific Resume Variant — usually with a linked Job Target — as its mandatory input. Career Advisor is the first feature whose only required input is the user themself: `question` is the sole thing a request must supply. Every other piece of context (Profile, Master Resume, its sections, Job Targets, Resume Variants, Applications, ATS Reports, Interview Sessions) is read best-effort and rendered into the prompt only when present. A brand-new user with zero data still gets a valid recommendation — the AI is instructed to say so plainly and give general, non-fabricated advice.

## 1. Why this module exists

Per FASE 18's brief: Career Advisor must reuse AI Orchestration, the existing `PromptBuilder`/`PromptRegistry` pattern, the existing credit-charge/refund/idempotency mechanism, and every other module's own context — with zero direct AI calls and zero direct credit deduction.

```
CareerAdvisorService
  → ProfileService.getForUser()                  (Phase 2A, reused unchanged — optional)
  → MasterResumeService.getForUser()              (Phase 2A, reused unchanged — optional)
  → ResumeSectionsService.list()                  (Phase 2A, reused unchanged — work-experience/
                                                     education/skills only, fetched only when a
                                                     Master Resume exists — see §3)
  → JobTargetService.list()                       (Phase 2B, reused unchanged — optional)
  → ResumeVariantService.list()                    (Phase 3, reused unchanged — optional)
  → ApplicationService.list()                      (Candidate Experience Engine, reused unchanged —
                                                     optional; cross-referenced with Job Targets
                                                     client-side, no new backend join)
  → AtsReportRepository.findAllByUserId()          (Phase 4, reused unchanged — optional)
  → InterviewService.list()                        (Phase 9/FASE 11, reused unchanged — optional)
  → AiOrchestrationService.execute()                (Phase 6, reused unchanged — this is the ONLY
                                                     path to a provider or the credit ledger)
```

`CareerAdvisorService` never calls `CreditService` directly and never calls an `AIProvider` directly — both rules are enforced structurally: the service has no dependency on `CreditService` or `ProviderRegistry` at all, only on `AiOrchestrationService`, exactly mirroring every prior feature.

## 2. Main Flow

```
POST /career-advisor/advice { question }
  ↓
CareerAdvisorService.requestAdvice()
  1. assertOwnerOrAdmin
  2. buildContext() — reads all 8 optional sources in parallel (Promise.all), never throwing on
     absence; resume sections are fetched only if a Master Resume exists (ResumeSectionsService.list()
     throws NotFoundException otherwise — see §3)
  3. buildContextSnapshot() — a lightweight, persisted summary of which sources were present
     (booleans/counts only — see §4)
  4. AiOrchestrationService.execute({ feature: CAREER_ADVISOR, input: { question, context }, … })
     → Validate Request → Load Context → Credit Check → Charge Credits → Build Prompt
       (CareerAdvisorPromptBuilder) → Select Provider/Model → Execute (DummyAIProvider) →
       Validate Response (CareerAdvisorResponseParser) → Store AiRequest → Return
  5. Persist a CareerAdvice row: question + parsed response + contextSnapshot + creditsCharged +
     aiRequestId
  ↓
GET /career-advisor/advice        — the caller's own history, most-recent-first
GET /career-advisor/advice/:id    — a single advice row (404 if it belongs to another user)
```

On any pipeline failure (invalid AI JSON, provider failure after retries, etc.), the same automatic refund `AiOrchestrationService`/`CreditService.spendAndExecute()` already provides to every feature applies unchanged — `CareerAdvisorService` persists nothing when `execute()` throws, mirroring Cover Letter's "no PENDING/FAILED row" precedent.

## 3. Context gathering — priority order and graceful degradation

Rendered into the prompt in exactly this order (per the brief), each section entirely omitted — never rendered as an empty/fabricated placeholder — when its data is absent:

1. Professional profile (`Profile`)
2. Master Resume (title/summary/career level/years of experience/desired position/completion %)
3. Professional experience (`WorkExperience`)
4. Education (`Education`)
5. Skills (`Skill`)
6. Job Targets
7. Resume Variants (title only)
8. Application history (cross-referenced with Job Targets client-side in `CareerAdvisorService`, since `Application` only stores `jobTargetId` — no new backend join was added, same pattern already established for the Application Tracker frontend)
9. ATS analysis results (score + missing-keyword count only)
10. Interview practice history (mode/type/difficulty only)

`ResumeVariantService.buildSnapshot()` (used by Resume Variant creation to compose full section content) is `private` and was deliberately **not** made public or duplicated for this feature — items 3–5 above are read directly via `ResumeSectionsService.list()` for the 3 section types the brief actually asks for (work experience, education, skills), not all 11. `ResumeSectionsService.list()` throws `NotFoundException` when the user has no Master Resume yet, so `CareerAdvisorService` only calls it when `MasterResumeService.getForUser()` returned a row — this is the one real branch in an otherwise fully-parallel, fully-optional context build.

The prompt itself instructs the model: never invent qualifications, employers, degrees, or achievements not present in the data given; when data is sparse or absent, say so plainly and give general advice while suggesting what additional data would help; tone is practical, specific, and honest — explicitly not a "motivational coach."

## 4. Persistence — why a new table, and what it does and doesn't store

**Decision (approved before implementation):** a new `CareerAdvice` table was required. `AiRequest` (`ai_requests`) was confirmed insufficient — it tracks technical/billing metadata only (tokens, cost, status, prompt hash) and has **no field for the actual prompt or response text**, by design (`docs/architecture/ai-architecture.md` §5). No existing feature reconstructs its user-facing content from `AiRequest` — `cover_letters.content`, `resume_optimizations`/`optimization_suggestions`, and `interview_questions`/`interview_answers` all have their own dedicated tables for exactly this reason. `CareerAdvice` follows the same established precedent, not a new one.

```prisma
model CareerAdvice {
  id                String   @id @default(uuid())
  userId            String
  question          String
  summary           String
  currentAssessment String
  strengths         String[]
  gaps              String[]
  recommendations   String[]
  nextSteps         String[]
  contextSnapshot   Json?
  creditsUsed       Int      @default(0)
  aiRequestId       String?
  createdAt         DateTime @default(now())
}
```

`contextSnapshot` is a **lightweight summary only** — booleans/counts of which sources contributed (`hasProfile`, `hasMasterResume`, `workExperienceCount`, `skillsCount`, `jobTargetsCount`, …), never the underlying resume/job-target content itself. That content already lives in, and can always be re-read from, its own source-of-truth tables — duplicating it here would be exactly the "easily reconstructible derived data" the brief said not to store. `aiRequestId` is a loose pointer (not a foreign key), matching this schema's existing cross-reference style (e.g. `Payment.providerReference`).

Migration: `20260827191043_career_advisor_engine`, purely additive — one new table, one new `User.careerAdvices` relation. No existing table or column was touched.

## 5. Pricing

`AIFeature.CAREER_ADVISOR = 'career_advisor'` — **30 credits**, approved by the user during this phase's decision checkpoint. The "15" figure that appeared in `ai-orchestration.e2e-spec.ts` before this phase was confirmed to be arbitrary generic test-fixture data (that same file also used "30" for Cover Letter, whose real price is 40) — it was never treated as a decided value. See [credit-architecture.md](credit-architecture.md) §5 for the authoritative pricing table.

`feature_pricing` has no general seed mechanism yet (a known, pre-existing gap — see `prisma/seed-templates.ts`'s own doc comment); populating the real row for `career_advisor` in a given environment is Phase 12 (Admin Dashboard) scope, same as every other feature's price today. Each e2e spec — including `career-advisor.e2e-spec.ts` — creates and tears down its own temporary `feature_pricing` row, exactly like `cover-letter.e2e-spec.ts`'s established precedent.

## 6. Response format

Structured JSON, validated by `CareerAdvisorResponseParser` — the same `responseValidator`-based pattern `CoverLetterResponseParser`/`ResumeOptimizationResponseParser` already established (any throw here triggers the same automatic credit refund as any other pipeline failure):

```json
{
  "summary": "string",
  "currentAssessment": "string",
  "strengths": ["string", "…"],
  "gaps": ["string", "…"],
  "recommendations": ["string", "…"],
  "nextSteps": ["string", "…"]
}
```

Empty arrays are valid (the sparse-data case) — only a missing/non-array field, or a non-string/empty-string array item, is rejected. `DummyAIProvider`'s shared JSON envelope (`ai-orchestration/providers/dummy-ai-provider.ts`) was extended with these 5 new fields, the same precedented, additive extension Phase 9 already made for Interview's `questions[]`/`evaluations[]`.

## 7. Frontend

`app/dashboard/career-advisor/page.tsx` — one page: suggested-question chips (the 5 exact questions from the brief), a free-text question field, a live credit-cost indicator (`GET` via `POST /credits/estimate`, never hardcoded), a submit button with a loading state, the structured response rendered as summary/assessment/strengths/gaps/recommendations/next-steps, and a history list below (`GET /career-advisor/advice`). `lib/api/career-advisor.ts` exposes `useCreditEstimate()`, `useCareerAdviceHistory()`, and `useRequestCareerAdvice()` (invalidates the advice-history and credit-estimate/wallet caches on success, refreshing the displayed balance). No new reusable component was introduced where an equivalent (`PageHeader`, `EmptyState`, `ErrorState`, `Card`, `Badge`) already existed.

## 8. Ownership and API surface

`POST /career-advisor/advice`, `GET /career-advisor/advice`, `GET /career-advisor/advice/:id` — self-service only (the caller is always both requester and target), with the same `assertOwnerOrAdmin` + 404-not-403 IDOR-safe pattern used everywhere else in this codebase. Admin bypass works via the same service-level pattern already established (`CareerAdvisorService.getOne()` accepts an admin `RequestUser` for a different `targetUserId`), never a separate admin route.

## 9. Idempotency

`AiRequest.idempotencyKey` / `CreditTransaction.idempotencyKey` are reused exactly as implemented — no parallel mechanism. `CareerAdvisorService` generates a fresh `career-advisor:${userId}:${randomUUID()}` key per call, matching Cover Letter's precedent (every "generate" action is meant to always execute, so a fresh key is correct here — the shared mechanism itself, proven generically in `ai-orchestration.e2e-spec.ts`, guarantees that a genuinely repeated key never double-charges).
