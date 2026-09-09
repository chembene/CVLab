# CVLab AI — Development Roadmap Validation

Status: resolved (approved 2026-07-30). Source: `prompts/14-development-roadmap.md` (Phases 0–16). This document records whether the proposed milestone order is technically sound and what, if anything, should change.

## Assessment: the phase order is technically sound, with two sequencing notes

The roadmap's dependency order is broadly correct:

```
Phase 0  Foundation
Phase 1  Auth               ← everything needs identity
Phase 2  Profile
Phase 3  Credit Engine      ← must exist before anything charges credits
Phase 4  Payment Infra      ← must exist before credits can be purchased for real
Phase 5  CV Builder
Phase 6  AI CV Improvement  ← first credit-consuming feature
Phase 7  Cover Letters
Phase 8  ATS Analysis
Phase 9  Tests
Phase 10 Interview Practice
Phase 11 History
Phase 12 Admin Dashboard
Phase 13 Notifications
Phase 14 QA
Phase 15 Production Prep
Phase 16 Launch
```

Credits (Phase 3) correctly precedes Payments (Phase 4), which correctly precedes the first credit-consuming feature (Phase 6 AI CV Improvement) — this matches the domain boundary rule that Credits must be able to function (consume/refund/reserve) independently of any specific payment provider, and must exist before real money touches the system.

## Sequencing notes

1. **Phase 3 (Credit Engine) can be built and fully tested with a manually-seeded/admin-granted wallet, before Phase 4 (Payments) exists.** This is good — it means credit-consumption logic (reservation, idempotency, refunds) can be validated in isolation before the M-Pesa integration adds external-system risk. No change needed, just confirming the order is intentional and should be preserved.
2. **Phase 5 (CV Builder) does not depend on Phase 3/4 at all** — CV creation/editing is free. It could technically run in parallel with or before Phase 3–4. The roadmap's sequential order is still reasonable (keeps one thing in flight at a time, per the "never implement everything in one step" rule), but it is not a hard dependency — worth knowing if the team ever needs to reorder for staffing reasons.
3. **History (Phase 11) and Notifications (Phase 13) are both "read/observe" concerns that touch every prior module.** Building them _after_ Phases 3–10 exist (so there are real events to observe) is correct; however, if history/notification hooks are bolted on retroactively to five already-built modules, that's more invasive than adding an event hook at each module's original build time. **Resolved:** the domain-event architecture in [system-architecture.md](../architecture/system-architecture.md) §4 formalizes this — each module emits its own typed events starting in Phase 3, and History/Notifications/Analytics attach as listeners in Phase 11/13 without touching the emitting modules' code.
4. **Admin Dashboard (Phase 12) depends on nearly everything (Phase 1–10)** — its position after them is correct and required.

## No changes required to phase order itself

The roadmap does not need restructuring. The one actionable recommendation is #3 above (emit domain events early rather than retrofitting), which is an implementation-detail note for whoever builds Phases 3–10, not a roadmap change.

## Definition of Done / Review Gate (unchanged, restated for visibility)

Every milestone must produce: working code, tests, documentation, migrations (if any), API docs, changelog update — and passes an architecture/code-quality/database/security/tests/performance/documentation review gate before the next phase starts (`prompts/14-development-roadmap.md` §5–6). This applies starting with Phase 0.

## Phase 2A / 2B — Actual Implementation vs. This Document (reconciliation note)

As implemented, Phase 1 (Auth) was followed by **Phase 2A: Resume Engine** (Profile, Master
Resume, 11 sections) and **Phase 2B: Job Target Engine** (Job Target + its child collections,
Application tracking) — matching `docs/business/6.product-roadmap.md.txt`'s Phase 1
(Authentication, Profile, Master Resume, Resume Sections) and Phase 2 (Job Target, ATS Analysis,
Resume Optimization, Cover Letters), **not** this document's Phase 0-16 numbering, which sequences
Profile (Phase 2) directly before Credit Engine (Phase 3) and defers CV/AI/ATS-adjacent work to
Phases 5-8.

**The two roadmap documents disagree on ordering**, specifically: `docs/business/6.product-roadmap.md.txt`
groups Job Target, ATS Analysis, Resume Optimization, and Cover Letters into one "Phase 2," ahead
of its Credit Engine "Phase 3" — but ATS Analysis, Resume Optimization, and Cover Letters are
credit-consuming paid features per `prompts/10-business-rules.md` §4, and per this document's own
Phase 3/4 sequencing note above, Credits must exist before anything charges credits. Implemented
Phase 2B resolves this by scope: it built **only** the Job Target data model and Application
tracking (no AI, no credit consumption — `JobTargetAnalysisService`'s methods all throw
`NotImplementedException`, see [master-resume-data-model.md](../architecture/master-resume-data-model.md)
§8). ATS Analysis, Resume Optimization, and Cover Letter generation remain correctly deferred until
after a Credit Engine exists, regardless of which document's phase numbering is used going forward.
**This discrepancy between the two roadmap documents is flagged, not silently resolved** — a future
pass should pick one authoritative phase-numbering document (or explicitly merge them) before
starting the next phase.

## Phase 3 (as implemented) — Resume Variants Engine

Continuing the session's own informal 2A/2B/3 numbering (not a label from either source roadmap
document — see above), Phase 3 built the **Resume Variants Engine**: independent, per-Job-Target
copies of the Master Resume (`resume_variants`), plus wiring `Application.resumeVariantId` to a
real, ownership-verified FK. Full detail in
[master-resume-data-model.md](../architecture/master-resume-data-model.md) §9.

This does not correspond to **either** document's "Phase 3": `prompts/14-development-roadmap.md`'s
Phase 3 is Credit Engine; `docs/business/6.product-roadmap.md.txt`'s Phase 3 is Credit
Engine/Payments/M-Pesa/eMola. Resume Variants is a natural continuation of the Job Target flow this
session already established (Master Resume → Job Target → **Resume Variant** → AI Optimization →
Application Tracking, per [master-resume-data-model.md](../architecture/master-resume-data-model.md)
§8's diagram) and, like Phase 2B, stays scoped to data-model/CRUD only — no AI, ATS, Export, or
Credits, matching this document's own Phase 3/4-before-Phase-6 sequencing rule (nothing here
consumes credits, so nothing here needed to wait for a Credit Engine). The same recommendation
stands: **pick one authoritative phase-numbering document before the next phase**, since the
informal numbering used across this session (2A → 2B → 3) does not map cleanly onto either source
document's own Phase 3+.

## Phase 4 (as implemented) — ATS Analysis Engine

Continuing the session's informal 2A/2B/3/4 numbering, Phase 4 built a **fully deterministic ATS
Analysis Engine** (`ats_reports`) comparing a Resume Variant against its linked Job Target —
keyword/skill/education/language/experience matching, formatting/duplicate/empty-section
detection, configurable weighted scoring, rule-based recommendations. **No AI/OpenAI, no credit
consumption** — explicitly excluded by the brief, and correctly so: this document's own Phase 3/4
sequencing note (Credits before anything charges credits) only applies to features that actually
consume credits, and this one doesn't.

This is the first phase to touch what `docs/business/6.product-roadmap.md.txt` calls "Phase 2:
... ATS Analysis ..." (previously deferred in the Phase 2B note above, since AI-driven ATS analysis
requires a Credit Engine first) — resolved by building the **deterministic, rule-based half only**.
`JobTargetAnalysisService.calculateATS()` (Phase 2B stub) remains unimplemented and unrelated to
this engine; a future AI-driven ATS pass, if one is ever added on top of this deterministic one,
would need its own credit-consumption wiring and is out of this phase's scope entirely.

Same standing recommendation: **pick one authoritative phase-numbering document** — the informal
2A→2B→3→4 numbering used across this session still doesn't map cleanly onto either source
document's own phase numbers.

## Phase 5 (as implemented) — Credit Engine & Billing Foundation

Continuing the session's informal 2A/2B/3/4/5 numbering, Phase 5 built the **Credit Engine & Billing
Foundation**: `credit_wallets` + append-only `credit_transactions` ledger, atomic
conditional-decrement spending (concurrency-safe without a version column, see
[credit-architecture.md](../architecture/credit-architecture.md) §3), idempotent spend/refund/adjust
paths, an automatic spend-then-refund-on-failure flow (`CreditService.spendAndExecute()`), admin
credit adjustment with audit logging, and the `BillingProvider` abstraction with a placeholder
`MpesaBillingProvider` (no real M-Pesa calls). `ai_requests` was also extended
(`provider`/`prompt_hash`/`credits_refunded`) with a matching `AiRequestTrackingService` — still no
real OpenAI/AI calls anywhere in the codebase.

**This is the first phase in the session where the informal numbering partially converges with both
source roadmap documents' own numbering:** `prompts/14-development-roadmap.md`'s Phase 3 and
`docs/business/6.product-roadmap.md.txt`'s Phase 3 are **both** "Credit Engine" (the latter bundled
with Payments/M-Pesa/eMola) — the same subject matter this session's Phase 5 substantively delivers,
just two informal-numbering steps later than either source document, because this session's own
2A/2B/3/4 sequence (Resume Engine → Job Target → Resume Variants → ATS) inserted three data-model
phases ahead of it that neither source document sequences that way. The convergence is only partial:
this phase deliberately stopped short of the Payments half both source documents bundle into their
own "Phase 3/4" — per the brief, only the `BillingProvider` abstraction and placeholder were built,
with **no real M-Pesa integration, no payment intents, no callback handling**. That remains the next
natural phase (see below).

Same standing recommendation, now partially moot for this specific subject: **pick one authoritative
phase-numbering document** for whatever comes after Payments — the informal 2A→2B→3→4→5 numbering
still doesn't map cleanly onto either source document's own phase numbers for the data-model phases
that came before Credits, even though Credits itself has now landed under both documents' shared
label.

**Recommended next phase (as it stood after Phase 5):** Payments (M-Pesa integration), sourcing exact endpoint/payload/auth
details from the [official M-Pesa developer portal](https://developer.mpesa.vm.co.mz/) per
`prompts/00-rules.md` "Do Not Guess" — the `BillingProvider` interface and `CreditService.allocateFromPurchase()`/`reverse()`
this phase built are ready and tested, waiting for a real caller. A `credit_packages`/`feature_pricing`
seed script is a prerequisite either alongside or just before that phase, per the known gap flagged
in [credit-architecture.md](../architecture/credit-architecture.md) §5.

**What actually happened instead:** the session's Phase 6 built AI Orchestration, not Payments — see
below. Both were legitimate "next phase" candidates once Credits existed (neither depends on the
other: AI Orchestration needs `CreditService.estimate()`/`spendAndExecute()`, both already built in
Phase 5; Payments needs `BillingProvider`, also already built in Phase 5). This wasn't a course
correction, just a different valid ordering of two independent follow-on phases.

## Phase 6 (as implemented) — AI Orchestration Engine

Continuing the session's informal 2A/2B/3/4/5/6 numbering, Phase 6 built the **AI Orchestration
Engine**: a provider abstraction (`AIProvider`/`ProviderRegistry`/`ProviderSelector`/`ModelSelector`),
a prompt framework (`PromptBuilder`/`PromptRegistry`/`PromptHash`/`PromptVersion`), an 11-step
execution pipeline (`AiOrchestrationService`) reusing Phase 5's `CreditService.spendAndExecute()` for
the credit-charge-and-automatic-refund half rather than reimplementing it, a configurable
`RetryExecutor`, a cache abstraction (`AICacheService`/`NoopAiCacheService`, not yet wired into the
pipeline), and a typed `AIError` hierarchy (7 subclasses). `DummyAIProvider` is the sole registered
provider — deterministic, zero external calls, per the brief's explicit "must not integrate any real
AI provider." `ai_requests` gained `prompt_version`. Full design in
[ai-orchestration.md](../architecture/ai-orchestration.md).

**Relative to both source roadmap documents:** neither `prompts/14-development-roadmap.md` nor
`docs/business/6.product-roadmap.md.txt` names an "AI Orchestration" phase distinct from the AI
features themselves (CV improvement, ATS, cover letters, etc.) — both treat "AI" as a single
undifferentiated capability bundled into whichever phase first needs it. This session's Phase 6 is a
deliberate architectural insertion **ahead of** any actual AI feature, matching this document's own
established pattern (Phase 3/4 sequencing note: build the reusable infrastructure — Credits, now AI
Orchestration — before the first feature that depends on it, per `prompts/00-rules.md`'s
"Never duplicate logic"/Clean Architecture principles). No source document's phase numbering is
contradicted by this — it's an elaboration neither document was granular enough to call out.

**Still zero AI features implemented** — `PromptRegistry` is empty in production; every one of
`docs/business/6.product-roadmap.md.txt`'s "Phase 2" features (Resume Optimization, Cover Letter, ATS
AI, etc.) remains exactly as unimplemented as before this phase, just now with a pipeline ready to
receive them.

Same standing recommendation: **pick one authoritative phase-numbering document** — this session's
informal 2A→2B→3→4→5→6 numbering still doesn't map one-to-one onto either source document, though
Credits (Phase 5) and now the AI infrastructure half of "Phase 2"/"Phase 6" AI work are both
substantively delivered regardless of which document's labels are used going forward.

**Recommended next phase:** either (a) Payments (M-Pesa integration) — unblocked since Phase 5, still
entirely undone, or (b) the first real AI feature — most naturally Resume Optimization or Cover
Letter, since both are simpler than ATS-AI or Interview (no multi-turn state) — which would mean:
a `ResumeOptimizationPromptBuilder`/`CoverLetterPromptBuilder`, a real `AIProvider` implementation
(sourced from the official OpenAI API documentation, never invented, per `prompts/00-rules.md` "Do
Not Guess"), a `feature_pricing` seed row for that feature's key, and — for the first time this
session — a controller. Either is legitimate; Payments unblocks real revenue, an AI feature unblocks
the product's core value proposition. Whichever is chosen, the `credit_packages`/`feature_pricing`
seed-script gap (flagged since Phase 5) should land alongside it, since both paths need it.

## Phase 7 (as implemented) — AI Resume Optimization Engine

Continuing the session's informal numbering, Phase 7 chose option (b) from Phase 6's "Recommended next
phase" above: the first real AI feature, **Resume Optimization**, built entirely on top of Phase 6's
AI Orchestration Engine. `ResumeOptimizationPromptBuilder` is now registered into `PromptRegistry` for
`AIFeature.RESUME_OPTIMIZATION`; `resume_optimizations`/`optimization_suggestions` tables persist each
run and its proposed edits; `ResumeSuggestionApplier` writes user-accepted suggestions back into a
Resume Variant's content inside one transaction; the ATS Engine (Phase 4) is reused unchanged both for
the "before" baseline and the automatic post-apply re-run. **Still `DummyAIProvider` only** — per the
brief, no real OpenAI/Claude/Gemini call was integrated; two small, generic (not
Resume-Optimization-specific) extensions were made to the Phase 6 engine to support it: `DummyAIProvider`
gained a deterministic JSON response-format mode, and `AiOrchestrationService.execute()` gained an
optional `responseValidator` hook in its "Validate Response" step. Full design in
[resume-optimization.md](../architecture/resume-optimization.md).

**Relative to both source roadmap documents:** both `prompts/14-development-roadmap.md`'s Phase 2 and
`docs/business/6.product-roadmap.md.txt`'s Phase 2 name "Resume Optimization" as an MVP feature. This
phase delivers exactly that feature, several sessions' worth of informal numbering later than either
document's own labels — the substance matches, only the label differs, consistent with every prior
phase's disclosed numbering drift.

**First feature-level proof the "no AI feature may bypass AI Orchestration" rule holds in practice, not
just on paper:** `ResumeOptimizationService` has zero constructor dependency on `CreditService`,
`WalletService`, `RefundService`, `ProviderRegistry`, or any `AIProvider` — only on
`AiOrchestrationService`. A future Cover Letter/Interview/Career Advisor/LinkedIn feature has a proven
template to follow: one `PromptBuilder`, one feature module registering it, zero new orchestration code.

**Still open, unblocked by nothing in this phase:** the `credit_packages`/`feature_pricing` seed-script
gap (flagged since Phase 5) — `resume_optimization`'s `feature_pricing` row (80 credits, per
`docs/business/1.pricing-strategy.md.txt`) is inserted manually by this phase's own e2e suite, same as
every prior phase's tests. Payments (M-Pesa) also remains entirely undone, still the other standing
"recommended next phase" candidate from Phase 6.

**Recommended next phase:** either (a) Payments (M-Pesa integration, unblocked since Phase 5, still
untouched), or (b) a second AI feature (Cover Letter is the natural next choice — no multi-turn state,
same shape as Resume Optimization) to prove the AI Orchestration template generalizes beyond its first
user, or (c) the `credit_packages`/`feature_pricing` seed script itself, now overdue across three
phases. Whichever is chosen, no changes to AI Orchestration, Credits, or Resume Optimization are
expected to be required.

## Phase 8 (as implemented) — AI Cover Letter Engine

Continuing the session's informal numbering, Phase 8 chose option (b) from Phase 7's "Recommended next
phase" above: a second real AI feature, **Cover Letter**, built on the exact template Resume Optimization
established. `CoverLetterPromptBuilder` is registered into `PromptRegistry` for `AIFeature.COVER_LETTER`
(reserved since Phase 6, dormant until now); a `cover_letters` table persists each generation, with
"never overwrite previous versions" enforced by `regenerate()` always creating a brand-new row rather
than mutating the source. Reuses Resume Variant, Job Target, ATS, and — new this phase — **Resume
Optimization itself** as an optional upstream input (an AI feature's summary feeding into a second AI
feature's prompt, the first cross-AI-feature composition in this codebase). **Still `DummyAIProvider`
only** — per the brief, no real OpenAI/Claude/Gemini call was integrated; `DummyAIProvider`'s Phase 7 JSON
envelope was extended (not replaced) with `title`/`coverLetter` fields, remaining fully generic. Full
design in [cover-letter-engine.md](../architecture/cover-letter-engine.md).

**Relative to both source roadmap documents:** both `prompts/14-development-roadmap.md`'s Phase 2 and
`docs/business/6.product-roadmap.md.txt`'s Phase 2 name "Cover Letters" as an MVP feature alongside
Resume Optimization. This phase delivers exactly that, completing both documents' Phase 2 AI-feature
pair (Resume Optimization + Cover Letter) — the same substantive convergence noted for every prior phase,
several sessions later than either document's own labels.

**Second feature-level proof the "no AI feature may bypass AI Orchestration" rule holds in practice**:
`CoverLetterService`, like `ResumeOptimizationService` before it, has zero constructor dependency on
`CreditService`, `WalletService`, `RefundService`, `ProviderRegistry`, or any `AIProvider` — only on
`AiOrchestrationService`. Two-for-two on the "one `PromptBuilder`, one feature module, zero new
orchestration code" template — Interview/Career Advisor/LinkedIn have two proven precedents to follow now,
not one.

**A schema difference worth flagging, not a bug**: unlike `OptimizationStatus` (`PENDING`/`COMPLETED`/
`FAILED`), `CoverLetterStatus` (`DRAFT`/`GENERATED`/`EDITED`/`ARCHIVED`) has no `PENDING`/`FAILED` value —
this phase's brief specified that exact 4-value enum, and a `cover_letters` row is accordingly only ever
created after a successful AI response, never as a placeholder. Two different, both-correct designs for
two different phases' explicit schemas — disclosed in
[cover-letter-engine.md](../architecture/cover-letter-engine.md) §7 rather than silently reconciled.

**Still open, unblocked by nothing in this phase:** the `credit_packages`/`feature_pricing` seed-script
gap (flagged since Phase 5, restated every phase since) — `cover_letter`'s `feature_pricing` row (40
credits, per `docs/business/1.pricing-strategy.md.txt`) is inserted manually by this phase's own e2e
suite. Payments (M-Pesa) remains entirely undone, now the standing "recommended next phase" candidate
across three consecutive phases.

**Recommended next phase:** either (a) Payments (M-Pesa integration, unblocked since Phase 5, still
untouched across three phases now), (b) a third AI feature (Interview or Career Advisor — Interview
introduces genuine multi-turn state, a new shape neither Resume Optimization nor Cover Letter has
exercised yet), or (c) the `credit_packages`/`feature_pricing` seed script itself, now overdue across four
phases and arguably the highest-leverage remaining gap since every future AI feature and Payments both
depend on it. Whichever is chosen, no changes to AI Orchestration, Credits, Resume Optimization, or Cover
Letter are expected to be required.

## Phase 9 (as implemented) — AI Interview Preparation Engine

Continuing the session's informal numbering, Phase 9 chose option (b) from Phase 8's "Recommended next
phase" above: a third real AI feature, **Interview Preparation**, built on the exact template Resume
Optimization and Cover Letter established — and the first to need **two** AI operations instead of one.
`InterviewQuestionPromptBuilder`/`InterviewEvaluationPromptBuilder` are registered into `PromptRegistry`
under two new `AIFeature` values (`INTERVIEW_QUESTIONS`/`INTERVIEW_EVALUATION`); `interview_sessions`/
`interview_questions`/`interview_answers` persist a full start → generate-questions → answer → evaluate
practice run. Reuses Resume Variant, Job Target, ATS, Resume Optimization, **and Cover Letter** (both
prior AI features feed into this one's prompt as optional context) — the deepest cross-feature
composition so far. **Still `DummyAIProvider` only** — per the brief, no real OpenAI/Claude/Gemini call
was integrated; `DummyAIProvider` gained array-count-aware sizing (a new, generic
`array-count-instruction.util.ts`) so its `questions[]`/`evaluations[]` arrays match whatever length the
prompt asks for, still without becoming feature-aware. Full design in
[interview-engine.md](../architecture/interview-engine.md).

**Relative to both source roadmap documents:** neither names an "Interview Preparation" phase distinct
from a broader "Interview Practice" feature area (`docs/business/1.pricing-strategy.md.txt` lists
"Interview Practice: 60 credits" as one line item); this phase delivers that feature, splitting the one
listed price across its two real AI operations (30/30, disclosed in
[interview-engine.md](../architecture/interview-engine.md) §12) since the source document doesn't itemize
question generation separately from evaluation.

**Third feature-level proof the "no AI feature may bypass AI Orchestration" rule holds in practice, and
the first with two AI steps in one feature**: `InterviewService`, like `ResumeOptimizationService` and
`CoverLetterService` before it, has zero constructor dependency on `CreditService`, `WalletService`,
`RefundService`, `ProviderRegistry`, or any `AIProvider` — only on `AiOrchestrationService`. Registering
two `PromptBuilder`s from one feature module, each behind its own `AIFeature` key, proves the "one builder
per feature key" design generalizes past the one-builder-per-feature case Phase 7/8 established.

**One required change to pre-existing schema, disclosed, not silent**: this phase's brief names its
models `InterviewSession`/`InterviewQuestion`/`InterviewAnswer` literally, which collided with a Phase 0
placeholder `Interview`/`InterviewQuestion` pair that had sat dormant (schema-only, never implemented)
since the very first phase. Per "Do not modify previous phases except when absolutely required," the
dormant placeholder was removed and superseded — the one exception this phase's own brief anticipated by
using that exact phrase. See [interview-engine.md](../architecture/interview-engine.md) §9.

**Still open, unblocked by nothing in this phase:** the `credit_packages`/`feature_pricing` seed-script
gap (flagged since Phase 5, restated every phase since) — `interview_questions`/`interview_evaluation`'s
`feature_pricing` rows are inserted manually by this phase's own e2e suite. Payments (M-Pesa) remains
entirely undone, now the standing "recommended next phase" candidate across four consecutive phases.

**Recommended next phase:** either (a) Payments (M-Pesa integration, unblocked since Phase 5, still
untouched across four phases now), (b) a fourth AI feature (Career Advisor or LinkedIn — both remaining
`AIFeature` values from Phase 6's original six), or (c) the `credit_packages`/`feature_pricing` seed
script itself, now overdue across five phases and arguably the highest-leverage remaining gap since every
future AI feature and Payments both depend on it. Whichever is chosen, no changes to AI Orchestration,
Credits, Resume Optimization, Cover Letter, or Interview are expected to be required.

## Phase 10 (as implemented) — Frontend Foundation & UX/UI System

The first frontend-focused phase since Phase 2A, and by far the largest: a complete visual/navigational
shell for every backend module delivered across Phases 1–9. **Zero backend code changed** — the brief was
explicit ("Do NOT modify backend business logic. Do NOT break existing APIs.") and this phase honored it
literally; every mutation/query in `lib/api/*.ts` was verified against the real DTOs in
`apps/api/src/**/dto/*.ts` while building, not guessed. Full design and rationale in
[frontend-architecture.md](../frontend/frontend-architecture.md),
[design-system.md](../frontend/design-system.md), and
[component-library.md](../frontend/component-library.md).

**Scope**: shadcn/ui-style component library (hand-written, Radix + Tailwind + CVA — 19 primitives, ~15
cross-feature composites), CSS-variable design system with light/dark theming (`next-themes`), a
responsive sidebar/topbar/mobile-drawer shell (`lib/nav-items.ts` as the single navigation source of
truth), React Query as the sole server-state layer (one `lib/api/<domain>.ts` file per backend domain),
React Hook Form + Zod on every form, and ~15 dashboard pages covering Auth, Dashboard, Profile, Settings,
Master Resume Editor (restyled Phase 2A `SectionManager`), Resume Variants ("Resume List"/"Resume
Versions"), Job Targets, ATS Reports, Resume Optimization, Cover Letters, Interview Preparation, Credits,
Transactions, and History.

**Three deliberately disclosed mock-data surfaces** (per the brief's "use mock data only where endpoints
do not yet exist"): the notifications dropdown, the dashboard usage chart, and the History page — all
three correspond to backend surfaces that genuinely don't exist yet (`Notification`/Analytics are
schema-only or conceptual; `GET /history` has no controller despite `HistoryListener` writing to
`history_events` since Phase 2A). See [frontend-architecture.md](../frontend/frontend-architecture.md) §7
for the full disclosure table. Every other page is wired to real, working endpoints.

**One frontend-only resilience fix, not a backend change**: `apiFetch()` gained transparent 401
refresh-and-retry (silent `POST /auth/refresh` + one retry, de-duplicated across simultaneous 401s),
resolving a limitation disclosed since Phase 2A ("no automatic silent-refresh-and-retry"). `POST
/auth/refresh` itself is untouched — it already behaved exactly as this new client-side logic now expects,
since Phase 1.

**A real bug found and fixed**: `Button`'s `asChild` (Radix `Slot`) path crashed Next's static prerender
on every `<Button asChild><Link>...</Link></Button>` usage — including the landing page's own primary
CTA — because a conditionally-rendered loading spinner (`{loading && <Loader2/>}`) still counts as an
extra child node even when `loading` is `false`, and `Slot` requires exactly one. Caught only by
`npm run build`, not `next lint` or `tsc`. Fixed and regression-tested — see
[frontend-architecture.md](../frontend/frontend-architecture.md) §10.

**Quality gate**: typecheck, lint, and build all clean across `apps/web` (22 routes) and the unaffected
`apps/api`/`packages/*` workspaces; 37 frontend tests passing (component, page-rendering, navigation, and
form-validation coverage, per the brief's explicit test categories) — see
[component-library.md](../frontend/component-library.md) §5. Backend's own 548 unit + 151 e2e tests were
not re-run in this phase (no backend file changed) but remain green from Phase 9's own gate.

**Recommended next phase:** either (a) Payments (M-Pesa integration, now the only major backend area with
zero frontend surface either, once built), (b) a fourth AI feature (Career Advisor or LinkedIn), or (c)
the still-overdue `credit_packages`/`feature_pricing` seed script — now genuinely user-visible as a gap,
since `/dashboard/credits`' estimate tool will 404 against an unseeded feature key in a fresh environment.

## Phase 10.5 (in progress) — Intelligent Candidate Experience

Upgrades the product experience before Payments: eliminating manual data entry wherever the platform can
extract it instead. Milestone-by-milestone; this section is updated as each sub-feature lands.

**CV Import Engine — implemented (backend + frontend).** Users upload a PDF/DOCX; `CVParser` extracts personal data,
summary, experience, education, skills, languages, certificates, and projects entirely deterministically
(regex + PT/EN section-header heuristics) — **no AI call**, since routing real uploaded-document content
through the deterministic `DummyAIProvider` would fabricate experience/education entries unrelated to what
the user actually uploaded, a direct conflict with CLAUDE.md's AI-integrity rule. Per-field confidence
scores accompany every extracted value. **Never automatically saved** — a `CvImport` preview row is created
first; the Master Resume + section rows are only written once the user explicitly confirms
(`POST /cv-import/:id/confirm`), matching the brief's explicit "Preview → User confirms" flow. PDF text
extraction uses `pdfjs-dist` directly (not the `pdf-parse` wrapper, which turned out unable to parse
spec-valid classic-cross-reference-table PDFs — reproduced and confirmed against both a hand-built minimal
PDF and `pdfkit`'s own output). Full design in [cv-import.md](../architecture/cv-import.md).

**CV Import User Flow Integration — implemented.** The backend module above had zero frontend surface
until this pass: a new `/dashboard/import-cv` page (dropzone → processing → review → confirm → success,
matching the "Dashboard → Import CV → Upload → Parse → Review → Edit → Confirm → Master Resume" flow
end-to-end), 6 new `lib/api/cv-import.ts` hooks, and discoverability wired into the sidebar nav, the
Dashboard (a quick action plus a prominent onboarding banner when the user has no Master Resume yet), and
the Master Resume page's empty state. Resume Variants are never auto-created from an import — "Criar CV
para uma vaga" only navigates to the existing Job Targets workflow. This pass's audit also found and fixed
two real backend gaps: `confirm()` unconditionally called `createForUser()` and 409'd if the user already
had a Master Resume (now branches to `updateForUser()` instead — "Master Resume is populated **or
updated**"), and a single duplicate skill/certificate/education on a re-import used to abort the entire
confirm with no transaction to roll back (now gracefully skipped into `skippedEntries`, the same pattern
already used for missing-required-field entries). Both fixes are additive — no endpoint signature changed,
and the pre-existing "retrying an already-confirmed import 409s" test needed no changes. Full design in
[cv-import.md](../architecture/cv-import.md) §7–8.

**CV Import — Intelligent Import & Normalization pass — implemented.** (Not the roadmap's own numbered
"Phase 12 Admin Dashboard" below — an internally-labeled continuation of this same CV Import work; see
[cv-import.md](../architecture/cv-import.md) §13 for the full detail, this entry is deliberately brief to
avoid the numbering clash.) Real-user testing surfaced several parser failure modes across three rounds of
debugging (letter-spaced/glued headers, chunk-boundary edge cases, 2-column PDF layouts — eventually fixed
at the root with position-aware text extraction rather than another point patch), plus product gaps: the
canonical resume model formalized to cover all 9 importable section types (added `awards`,
`volunteerExperience`, `references` — the other 6 already existed), a deterministic (no AI, no fuzzy
matching) merge/conflict preview computed before commit, and an explicit "Substituir Currículo Principal" /
"Mesclar com Currículo Principal" choice — never a silent overwrite — when the user already has a Master
Resume. A live AI-normalization step was deliberately **not** wired in this pass: `AIFeature.CV_IMPORT` has
been reserved since Phase 10.5 but has no configured credit price anywhere in the codebase, and setting one
unilaterally would violate CLAUDE.md's financial-integrity rules — the contract is designed and documented
(§13f) for whichever future phase gets that product decision.

**Job Import Engine — implemented, then enhanced same day.** Users paste a job posting URL instead of
typing a Job Target by hand; the engine fetches the page (`JobFetcher`, SSRF-guarded), selects a parser by
hostname (`ParserRegistry` — dedicated Greenhouse/Lever/Workday/LinkedIn/Indeed parsers plus a
`GenericHtmlParser` fallback for every other ATS), and **automatically creates a `JobTarget`** — no
preview/confirm step, unlike CV Import. Extraction is built entirely on public, documented standards
(schema.org `JobPosting` JSON-LD, the Open Graph protocol) rather than per-ATS DOM scraping, so it's
real and verifiable rather than guessed-at. Low-confidence imports are flagged `REQUIRES_REVIEW` instead of
withheld. Same-day enhancement pass added: company logo resolution (4-step priority chain), disjoint
skills/technologies extraction, fixed-set normalization for seniority/employment-type/salary-period/
education-level, experience-years parsing, and duplicate-URL detection that reuses a prior extraction
instead of re-fetching/re-parsing. Full design in [job-import.md](../architecture/job-import.md).

**Resume Version History — implemented (backend).** "Users should never lose edits." Every content-changing
action on a Resume Variant — manual edit, "Save Version" checkpoint, restore, duplicate-from-version, and
(new) an automatic snapshot right before Resume Optimization/ATS analysis/Cover Letter generation/Interview
question generation run — now writes a permanent, append-only `ResumeVariantVersion` row, keeping
`ResumeVariant.version` in exact lockstep with the latest row's number even under concurrent requests
(Postgres's atomic `version: { increment: 1 }` is the only source of the next number — nothing computes it
locally). Restoring an older version **creates a new version**, never overwrites history. A dedicated,
read-only `ResumeVersionModule` (deliberately a leaf — zero dependency back on Resume Variant, to avoid a
circular import) exposes the timeline, single-version detail, and a section-by-section compare endpoint
(added/removed/changed/unchanged, via a documented 3-pass positional-matching diff for the array sections,
which have no stable per-item id). Every job Application now permanently references the exact Resume
Version submitted (`resumeVariantVersionId`, set from a fresh snapshot at creation/re-attachment) — editing
the Variant afterward never changes what a past application recorded. Full design in
[resume-version-history.md](../architecture/resume-version-history.md).

**Template Engine — implemented (backend + frontend).** A generic, extensible rendering engine — not a
fixed set of components — powering Resume Preview and Cover Letter Preview today, built to power PDF/DOCX
export, public sharing, and a template marketplace later without engine changes. 10 built-in Resume
Templates + 7 built-in Cover Letter Templates, stored as real DB catalog rows (`ResumeTemplate`/
`CoverLetterTemplate` — schema scaffolded in an earlier Phase 10.5 pass, populated and wired up here) rather
than code constants, directly enabling future marketplace fields (author, source, per-template versioning)
with zero rendering-engine changes. `ResumeVariant`/`CoverLetter` each gained a nullable `templateId` +
`themeOverrides` (Part 6 color/font/spacing customization) — both presentation-only, applied via plain
`update()` calls, never `applyEdit()`, so template/theme changes never bump `version` or write a
`ResumeVariantVersion` row. Frontend rendering pipeline: a 3-tier theme resolver (layout defaults < template
row < user overrides), 5 shared resume layout arrangements + 4 cover-letter ones (keyed by a `layout`
string, not a closed enum), and 9+1 shared, presentational renderer components (`HeaderRenderer`,
`ExperienceRenderer`, … + a generic `ListSectionRenderer` for the 4 sections not individually named in the
brief) reused unmodified across every template. Live Preview (Part 5) updates instantly on every
template/theme edit via an override-prop pattern, zero network round-trip per keystroke; a
`ResponsivePreviewFrame` toggles Desktop/Tablet/A4/Print/Mobile widths. Resume and Cover Letter Template
Galleries (Part 7/8) — data-driven `TemplateSwatch` thumbnails (no design-asset pipeline exists yet),
favorite/recently-used tabs, category filter — are two thin wrappers around one shared gallery shell, so
"same experience, separate gallery, separate previews" holds by construction, not convention. Full design in
[template-engine.md](../architecture/template-engine.md) and
[template-gallery.md](../frontend/template-gallery.md).

**Quality gate so far** (isolated per-feature, not the full 12-suite backend run — see
[tech-debt.md](tech-debt.md) for why): CV Import 63 unit (`cv-import.service`/`cv-parser`/
`cv-import-merge-analyzer`) + 10 e2e tests (backend, grown across the idempotency fixes, three rounds of
real-CV parser hardening, and the Intelligent Import & Normalization pass), 27 frontend unit/component
tests; Job Import 74 unit + 5 e2e tests (backend only —
frontend not yet built); Resume Version History 78 unit + 22 e2e tests (plus updated assertions in the 5
pre-existing suites its new `ResumeVariantVersion` FK's cleanup ordering affected — `ats-engine`,
`cover-letter`, `interview`, `resume-optimization`, `resume-variant-engine` — all passing together, 90
tests); Template Engine backend unit + 22 e2e tests, frontend 52 unit/component tests (which caught and
fixed a real bug — both preview components' loading guard masked the error state on a failed template
fetch, see [template-engine.md](../architecture/template-engine.md) §16–17); typecheck/lint/build clean
across all (backend + frontend). Remaining Phase 10.5 scope (Job Import's own frontend page, the Compare
Versions frontend page and the rest of the Resume Variant editor UI, Version Comparison's own frontend,
the 3-mode Interview redesign, the Smart Application Pipeline wizard, and every corresponding
frontend page) is tracked but not yet built. Export Engine (below) has since been built out of this list.

## Phase Export Engine (as implemented)

Audited read-only before implementation ("AUDITORIA — FASE Export Engine"), then approved and built phase by
phase: real PDF + DOCX export of a Resume Variant (current content or one specific historical
`ResumeVariantVersion`), generated on demand and streamed once in the HTTP response — no Cloudflare R2, no
persisted file. PDF reuses the exact same React rendering layer the live preview uses — extracted, unchanged,
into a new shared workspace package (`packages/resume-renderer`) consumed by both `apps/web` (raw source) and
`apps/api` (compiled `dist/`) — rendered server-side via `react-dom/server` and printed with headless Chromium
(`puppeteer-core`). DOCX is a genuinely separate serializer built directly on the `docx` library, sharing only
the section-title/date-formatting helpers with the PDF/preview renderer. New `ExportedDocument` model
(migration `20260812190944_export_engine`, additive) — audit/idempotency record only, deliberately not
reusing the dormant `Cv`/`CvVersion` placeholder tables. Not an AI feature — charges `CreditService` directly
(PDF 10 credits, DOCX 5 credits), never through `AiOrchestrationService`; refund-on-render-failure comes for
free from `CreditService.spendAndExecute()`'s existing behavior. Deterministic, non-random idempotency key
(`export:resume:{userId}:{variantId}:{versionNumber}:{format}`) reuses `CreditService.spend()`'s own
idempotency guard for the double-charge protection, rather than a parallel mechanism. `POST
/api/v1/exports/resume` is the API's first and only binary-response endpoint — bypasses the global
`ResponseInterceptor`'s JSON envelope via non-passthrough `@Res()`. Frontend: two "Exportar PDF — 10
créditos" / "Exportar DOCX — 5 créditos" buttons on the Resume Variant preview, Blob-based browser download,
no client-side persistence. Quality gate: backend unit 916/916, backend e2e 245/245 (16/16 suites, including
a genuine — and fixed — test-infrastructure issue where `pdfjs-dist`'s dynamic ESM import collided with
Jest's per-file environment teardown across a long `--runInBand` run; resolved by isolating that one
verification step in a short-lived child `node` process, test-only, zero production code touched), frontend
172/174 (the 2 failures are the pre-existing, unrelated `IntersectionObserver` gap on the marketing homepage),
typecheck/lint/build clean across both apps. Full design in
[export-engine.md](../architecture/export-engine.md). Cover Letter / Application Package export deliberately
not built in this phase (out of scope), but the module is shaped so they can be added later without a
structural refactor.

## Phase Smart Application Pipeline (as implemented)

Audited read-only before implementation ("AUDITORIA — FASE Smart Application Pipeline"), then approved and
built. Orchestrates 6 already-existing modules (Resume Variant, ATS Analysis, Resume Optimization, Cover
Letter, Interview, Export Engine, Application) into one guided, resumable "Prepare Application" wizard —
never re-implements any of their logic, never charges credits or calls AI of its own. The audit's headline
finding: `ApplicationPipelineSession` (+ its two enums) already existed in the schema, fully migrated
(`20260803202633_candidate_experience_engine`, several phases before this one), with zero application code
ever built against it and no architecture doc despite the schema's own comment citing one — reused as the
foundation rather than designing a second model. Checkpoint-approved additive migration
(`20260823172242_application_pipeline_export_finalize`) added the two step values the original design was
missing (`EXPORT`, `FINALIZE`) and two step-result pointer columns (`exportedDocumentId`, `applicationId`),
following the exact same plain-nullable-string convention already used for every other step-result pointer
on that row. Two minor, disclosed extensions to already-existing modules: `ApplicationModule`/`InterviewModule`
now export their services (every other feature module already did); `ExportService.exportResume()` now also
returns the created `ExportedDocument`'s id (additive, non-breaking — `ExportController` is unaffected). The
export step is deliberately its own binary HTTP response (not JSON-metadata-plus-a-second-call to
`POST /exports/resume`), to avoid rendering — and, for PDF, spinning up Chromium — the same file twice for one
logical export. Frontend: "Preparar candidatura" button on the Job Target detail page (Resume Variant picker
dialog) → a 6-step wizard page at `/dashboard/application-pipeline/[id]`. Testing a Radix `Select` in jsdom for
the first time in this codebase needed new global `jest.setup.ts` polyfills
(`scrollIntoView`/`hasPointerCapture`/`releasePointerCapture`), benefiting every other already-existing page
that used `Select` untested until now. Quality gate: backend unit 939/939, backend e2e 253 total (17/17 suites
green in a clean run; 2 pre-existing, unrelated, order-dependent failures — `cover-letter`, `cv-import` —
reproduced and already disclosed in the Export Engine phase's own report, confirmed passing 100% standalone
again here), frontend 176/178 (the 2 failures are the same pre-existing `IntersectionObserver` gap on the
marketing homepage), typecheck/lint/build clean across both apps. Full design in
[application-pipeline.md](../architecture/application-pipeline.md). The Application Tracker still has no
frontend page of its own (a pre-existing gap, not introduced by this phase) — the wizard's finalize step
creates a real, queryable `Application` row, but there is nowhere in the app to browse it yet.

## Phase Application Tracker Frontend (as implemented)

Audited read-only before implementation ("AUDITORIA — FASE Application Tracker Frontend"), then approved with
4 explicit decisions and built exactly to that approval — no scope expansion. Closed the gap the Smart
Application Pipeline phase's own report flagged: a real, queryable `Application` row existed (created by the
Pipeline's finalize step, or directly via the pre-existing `ApplicationController`) with nowhere in the app to
browse it. **Zero backend changes** — no migration, no new endpoint, no `GET /applications/:id`, no Prisma
`include`. `/dashboard/applications` (Card list — matching the dominant visual pattern already used by Job
Targets/Resume Variants/Cover Letters, not the `Table` pattern `/dashboard/transactions` alone uses; Tabs by
status, not Kanban — no drag-and-drop dependency added) and `/dashboard/applications/:id` both derive their
data from the existing `GET /applications` list query's React Query cache rather than a per-id endpoint, and
cross-reference Job Target/Resume Variant titles entirely client-side via the already-existing
`useJobTargets()`/`useResumeVariants()` list hooks — a pattern already established by every other list page in
this app, none of which join related entities server-side either. Cover Letter association is deliberately
**not** shown on the Application detail page — `Application` has no relation to `CoverLetter` at all (only to
`JobTarget`/`ResumeVariant`/`ResumeVariantVersion`), and the approved decision was to document that limitation
rather than add a field, a migration, or an unindexed reverse lookup into `ApplicationPipelineSession`.
`StatusBadge` (already shared by every status pill in the app) gained `ApplicationStatus`'s 7 values to its
existing tone-mapping sets — additive, no new component. The Pipeline's finalize step now links to the
created Application's own detail page. Frontend-only phase — quality gate: **15 new tests** (10 list page: loading/
empty/error, search by title, search by company, status-tab filtering, sort order, Job Target/Resume Variant
cross-referencing, card-level status control, detail-page navigation; 4 detail page: rendering, not-found,
status change, delete-with-confirmation-then-redirect; 1 Pipeline integration: "Ver candidatura" link), **191/193
total** (same 2 pre-existing, unrelated `IntersectionObserver` failures on the marketing homepage — confirmed,
not newly attributed), typecheck/lint/build clean. No backend files were touched, so no backend quality gate
was required or run. Testing Radix `Tabs`/`Select` interactions via `fireEvent.click` alone proved unreliable in
jsdom in this phase — Radix's `activationMode="automatic"` selects a tab/opens a select on **focus**, and
`fireEvent.click` does not itself move focus the way a real browser click does; calling `.focus()` on the
target before `fireEvent.click()` resolved it, no new dependency added. No new architecture doc — the backend
was already fully documented where it lives (`module-boundaries.md`), and no schema/API changed.

## Phase Payments & Credits (as implemented)

Audited read-only before implementation ("AUDITORIA — PAYMENTS & CREDITS"), then approved with 5 explicit
decisions and built exactly to that approval. Closed the gap every prior phase's documentation anticipated but
never filled: `CreditService.allocateFromPurchase()`/`.reverse()` (Phase 5) were built and tested specifically
"for a future Payments module to call" — nothing ever called them until now. **`MpesaBillingProvider` is still
exactly the same `NotImplementedException` stub from Phase 5** — no real M-Pesa credentials, endpoints, or
payload shapes exist anywhere in this repo, per `prompts/00-rules.md` "Do Not Guess"; this phase built the
entire system _around_ that still-unimplemented boundary, honestly: `POST /payments` really creates a
`Payment` row and really calls the provider, which really throws, and the row is really marked `FAILED` with
the reason recorded — a genuine `501`, never a silently-successful fake.

**Decision 1 (provider registry)**: `BillingProviderRegistry` now mirrors `ai-orchestration`'s `ProviderRegistry`
exactly, replacing Phase 5's single `BILLING_PROVIDER` DI token — `Payment.provider` selects the provider at
runtime. **Decision 2 (expiration)**: `Payment.expiresAt` (nullable, migration `20260823184232_payment_expires_at`,
additive) applied lazily on read, no cron/background job added. **Decision 3 (credit packages)**:
`GET /credit-packages`, top-level, authenticated, self-service — lives in `CreditsModule` alongside
`feature_pricing`'s own read path, not in `PaymentsModule`. **Decision 4 (pricing)**: no price was silently
"corrected" — the already-known, already-disclosed discrepancy between `credit-architecture.md`'s stale seed
table (Cover Letter: 25) and what's actually implemented and e2e-tested (40) is documented again in
`credit-architecture.md` itself, not resolved. **Decision 5 (M-Pesa only)**: no placeholder
`EmolaBillingProvider` was created — the registry alone carries the multi-provider readiness; adding e-Mola
later is one new provider class + one `.register()` call, never touching `PaymentService`/`CreditService`.

`PaymentService.confirmPayment()` is the single place a `Payment` ever becomes `COMPLETED`, reached identically
by a provider webhook (`POST /payments/callback/:provider`, deliberately unauthenticated) and a manual status
poll (`POST /payments/:id/verify`) — never duplicated between the two. It calls the already-idempotent
`CreditService.allocateFromPurchase()` **before** marking the `Payment` `COMPLETED` (not inside one shared DB
transaction — `CreditService`'s methods each own their own `$transaction()` and extending that was out of
scope), so a crash between the two steps is resolved safely by retry, never by double-crediting or by a
`COMPLETED` payment with no credits ever granted. `GET /credits`/`GET /credits/transactions` needed zero
changes to reflect real purchases — they already read the same `credit_wallets`/`credit_transactions` tables
`allocateFromPurchase()` writes to.

Frontend: a "Comprar créditos" section added to the existing `/dashboard/credits` page (package cards from
`GET /credit-packages`, a `POST /payments` purchase button per package, honest backend-sourced error/success
messaging — never inferring success client-side). `/dashboard/transactions` needed no changes — it already
renders `PURCHASE`/`BONUS` transaction types correctly.

Quality gate: backend unit **967/967** (28 new — `BillingProviderRegistry`, `CreditPackageRepository`,
`PaymentRepository`, `PaymentService`), backend e2e **265 total** (18/18 suites green across repeated clean
runs; one run mid-phase showed 3 suites failing with a bizarre multi-day-long duration metric, traced to the
session/machine having been asleep for several days mid-run — not a real regression, confirmed by immediately
re-running fresh: all 3 passed; the one suite that failed in the fresh re-run, `cover-letter`, is the same
pre-existing, already-disclosed cross-suite flakiness reported in every prior phase, reconfirmed passing 15/15
standalone), frontend **196/198** (same 2 pre-existing, unrelated `IntersectionObserver` failures),
typecheck/lint/`nest build`/`next build` clean across both apps. The full "webhook confirms → credits allocated"
happy path is unit-tested with a mocked provider, not e2e-tested over real HTTP — see
[payment-architecture.md](../architecture/payment-architecture.md) §10 for why. Full design in
[payment-architecture.md](../architecture/payment-architecture.md) and
[credit-architecture.md](../architecture/credit-architecture.md).

## Phase Career Advisor Engine (as implemented)

Audited read-only before implementation ("AUDITORIA — FASE 18: CAREER ADVISOR ENGINE"), then approved with 4
explicit decisions and built exactly to that approval. The audit's central finding: the exact architecture the
brief asked for was already fully built and directly reusable — `AiOrchestrationService`'s 11-step pipeline, the
`PromptBuilder`/`PromptRegistry` pattern, the JSON-response-parser pattern, `AiRequestTrackingService`, and the
credit-charge/refund/idempotency mechanisms needed zero structural changes. `AIFeature.CAREER_ADVISOR` existed
only as a reserved enum key, used nowhere except as arbitrary test-fixture data (`cost: 15`) in a generic
`ai-orchestration.e2e-spec.ts` test unrelated to this feature — confirmed via exhaustive grep before any price
was treated as decided.

**Decision 1 (persistence)**: a new `CareerAdvice` table was created — `AiRequest` was confirmed to store no
prompt/response text (technical/billing metadata only), and every prior AI feature already has its own
dedicated content table for the same reason, so this follows established precedent rather than introducing a
new one. Migration `20260827191043_career_advisor_engine`, purely additive. **Decision 2 (price)**: 30 credits,
a real business decision made in this phase — not inherited from the "15" test-fixture value. **Decision 3
(`DummyAIProvider` extension)**: its shared JSON envelope gained 5 new fields
(`currentAssessment`/`strengths`/`gaps`/`recommendations`/`nextSteps`), the same precedented, additive
extension Phase 9 already made for Interview. **Decision 4 (context snapshot)**: `CareerAdvice.contextSnapshot`
stores only booleans/counts of which optional sources contributed — never the underlying resume/job-target
content, which already lives in its own tables.

Unlike every prior AI feature, Career Advisor's only required input is the user themself — every context
source (Profile, Master Resume + 3 section types, Job Targets, Resume Variants, Applications, ATS Reports,
Interview Sessions) is read best-effort in parallel and rendered only when present; a user with zero data still
gets a valid, honest recommendation. `ResumeSectionsService.list()` throws when no Master Resume exists, so
sections are fetched only after confirming one does. Applications are cross-referenced with Job Targets
client-side in the service (no new backend join), the same pattern already established for the Application
Tracker frontend.

Frontend: a new `/dashboard/career-advisor` page — 5 suggested-question chips, a free-text question field, a
live credit-cost indicator (`POST /credits/estimate`, never hardcoded), the structured response, and a history
list. `lib/api/career-advisor.ts` adds a small, reusable `useCreditEstimate()` hook alongside
`useCareerAdviceHistory()`/`useRequestCareerAdvice()` — the first page in the app to show a feature's price
live from the backend rather than only after the fact.

Quality gate: backend unit **1006/1006** (39 new — prompt builder, response parser, repository, service,
controller), backend e2e **19/19 suites** including a new `career-advisor.e2e-spec.ts` (9 tests: happy path
with/without Master Resume context, insufficient balance, AiRequest tracking, invalid-JSON refund, idempotency
integration, ownership, admin bypass), confirmed with zero regressions against
`ai-orchestration.e2e-spec.ts`/`cover-letter.e2e-spec.ts`/`interview.e2e-spec.ts`/`resume-optimization.e2e-spec.ts`
(all of which touch either `PromptRegistry` or `DummyAIProvider`, both modified this phase), frontend
**212/214** (8 new; same 2 pre-existing, unrelated `IntersectionObserver` failure confirmed via `git stash` to
predate this entire session), typecheck/lint clean across both apps. A first implementation attempt seeded a
permanent `feature_pricing` row via a one-off script — caught and reverted before landing, since it collided
with `ai-orchestration.e2e-spec.ts`'s own temporary seeding of the same key and, more importantly, deviated
from this codebase's established convention that no feature's price has a checked-in seed script (Phase 12
Admin Dashboard scope); every e2e spec instead creates and tears down its own temporary row, matching
`cover-letter.e2e-spec.ts`'s precedent. Full design in
[career-advisor-engine.md](../architecture/career-advisor-engine.md).

## Phase LinkedIn / Professional Profile Engine (as implemented)

Audited read-only before implementation ("AUDITORIA — FASE 19: LinkedIn / Professional Profile Engine"), then
approved on a single pricing decision and built exactly to that approval. The audit's finding: `AIFeature.LINKEDIN`
existed only as a reserved enum key with **zero usage anywhere in the codebase** — not even as arbitrary
test-fixture data, unlike Career Advisor's "15" before FASE 18. `Profile.linkedin` (a plain URL field) and
`job-import/parsers/linkedin.parser.ts` (parses job postings scraped _from_ LinkedIn) were both confirmed
unrelated — no partial implementation existed to reuse or complete.

**Pricing decision**: 30 credits, a real business decision made in this phase — no prior value existed to
inherit. Persistence, `DummyAIProvider` extension, and context scope followed directly from precedent
(Career Advisor, FASE 18) without needing separate approval: a new `LinkedInProfile` table (same rationale as
`CareerAdvice` — `AiRequest` stores no content, and the required `GET` endpoints need somewhere real to read
from), `DummyAIProvider`'s envelope gaining 4 new fields (`headline`/`about`/`skills`/`experienceSuggestions`,
reusing `recommendations` as-is), migration `20260830124237_linkedin_engine`, purely additive.

Context is deliberately **narrower** than Career Advisor's 8-module reach — only Profile, Master Resume, 3
resume sections, and Job Targets (4 modules), matching this feature's own briefed scope. A considered-but-declined
option: feeding a user's Career Advisor history in as extra context — no precedent exists in this codebase for
one AI feature consuming another's persisted output as prompt input, and Career Advisor itself derives from the
same raw data LinkedIn already reads directly, so wiring it in would add coupling without a clear benefit.
Explicitly out of scope, per the brief: LinkedIn OAuth, real API integration, automatic publication, scraping,
messaging, recruiter-connection automation — this phase is content generation only.

Frontend: a new `/dashboard/linkedin` page — an optional target-role input (unlike Career Advisor, no mandatory
free-text field, so the generate button is only disabled on insufficient balance), a live credit-cost indicator
(reusing the existing `useCreditEstimate()` hook from `lib/api/career-advisor.ts` rather than duplicating it),
the structured response, and a history list. `lib/api/linkedin.ts` adds `useLinkedInProfileHistory()`/
`useGenerateLinkedInProfile()` following the exact same shape as Career Advisor's client.

Quality gate: backend unit **1044/1044** (38 new — prompt builder, response parser, repository, service,
controller), backend e2e `linkedin.e2e-spec.ts` **10/10** (happy path with/without target role, with/without
Master Resume context, insufficient balance, AiRequest tracking, invalid-JSON refund, idempotency integration,
ownership, admin bypass), confirmed with zero regression against `ai-orchestration`/`cover-letter`/`interview`/
`resume-optimization`/`career-advisor` (the 5 e2e specs that touch either `PromptRegistry` or `DummyAIProvider`,
both modified this phase) run together (82/82). A full 20-suite e2e run showed the same pre-existing,
already-documented cross-suite flakiness first disclosed in the Payments & Credits phase and reconfirmed in
FASE 18 (`feature_pricing` unique-constraint collisions and generic timeouts under sustained `--runInBand`
load) — 2 unrelated suites (`cover-letter`, `cv-import`) failed in that run and both passed cleanly (27/27)
when re-run standalone immediately after; `linkedin.e2e-spec.ts` itself passed in every single run, including
inside the full suite. Frontend **9/9 new** (loading, empty state, history rendering, insufficient balance,
successful generation with/without target role, error state, navigation entry), full frontend suite
**213/215** (same 2 pre-existing, unrelated `IntersectionObserver` failures), typecheck/lint clean across both
apps, `nest build`/`next build` clean. Full design in
[linkedin-engine.md](../architecture/linkedin-engine.md).

## Phase ATS AI Engine (as implemented)

Audited read-only before implementation ("AUDITORIA — FASE 20: ATS AI Engine"), then approved on a single
pricing decision and built exactly to that approval. The audit's finding: `AIFeature.ATS_AI` existed only as a
reserved enum key with **zero usage anywhere in the codebase** — its own doc comment had anticipated exactly
this feature since Phase 6 ("the future AI-assisted ATS suggestion feature... not a replacement for the
rule-based one"), but no price was ever attached and nothing was registered.

**Pricing decision**: 30 credits — a real business decision made in this phase, matching Career Advisor/LinkedIn
exactly (an initial 20-credit proposal, priced below those two to reflect that ATS AI consumes an
already-computed `AtsReport` rather than building context from scratch, was superseded by this explicit final
decision — the user's own reasoning: ATS AI is "uma camada adicional de interpretação/recomendação inteligente"
of the same category as those two). Persistence, `DummyAIProvider` extension, and the "never recompute" boundary
followed directly from precedent without needing separate approval.

**The one absolute rule this phase could not violate**: never duplicate the deterministic ATS engine (Phase 4).
Confirmed structurally — `AtsAiService` calls `AtsAnalysisService.getOne()` (an ownership-checked read of an
_existing_ report) and never touches `ats-scoring.util.ts`'s keyword-matching/scoring functions at all. A
dedicated e2e assertion reads the underlying `AtsReport` row before and after an AI analysis and confirms it is
byte-for-byte unchanged. A new `AtsAiAnalysis` table was created (same rationale as `CareerAdvice`/
`LinkedInProfile` — `AiRequest` stores no content, and the required `GET` endpoints need somewhere real to read
from), with two deliberate departures from that precedent: `atsReportId` is a real FK (not a loose pointer,
since the report being interpreted is genuine relational data, not an audit-log cross-reference), and the 3
recommendation arrays are stored as `Json` rather than a separate related table (nothing in them is ever
individually mutated, unlike `OptimizationSuggestion` — a separate table would be unused complexity). Migration
`20260830131600_ats_ai_engine`, purely additive.

Context is narrower still than LinkedIn's — and, uniquely among every AI feature built so far, **nothing in it
is optional**: `AtsReport.resumeVariantId`/`jobTargetId` are non-nullable, so a report's Resume Variant and Job
Target are structurally guaranteed to exist. The brief's own suggested output shape (`missingKeywords`/
`skillGaps` as flat arrays) was deliberately narrowed — echoing the deterministic report's own lists back as a
second AI-generated copy would duplicate data already rendered on the same page; the interpretation references
those keywords/skills by name within its prose instead.

Frontend: **no new page** — per the brief's explicit "não criar uma segunda experiência ATS," ATS AI was
integrated directly into the existing `/dashboard/ats-reports/[id]` detail page as a new "Interpretação com IA"
card, reusing `PriorityBadge`/`ScoreBadge`/`Alert`/`EmptyState`/`ErrorState` as-is — no new visual components.
`lib/api/ats-ai.ts` follows the same shape as `career-advisor.ts`/`linkedin.ts`.

Quality gate: backend unit **1085/1085** (41 new — prompt builder, response parser, repository, service,
controller), backend e2e `ats-ai.e2e-spec.ts` **10/10** (happy path proving the deterministic report is
untouched, invalid/cross-user `atsReportId` → 404 before any charge, insufficient credits, AiRequest tracking,
invalid-JSON refund, idempotency integration, ownership, admin bypass) — every test that needs an `AtsReport`
builds one for real through the existing, unchanged `POST /ats/run` endpoint, never seeding one directly,
confirmed with zero regression against `ai-orchestration`/`cover-letter`/`interview`/`resume-optimization`/
`career-advisor`/`linkedin`/`ats-engine` (101/101) run together. A full 21-suite e2e run showed the same
pre-existing, already-documented cross-suite flakiness first disclosed in the Payments & Credits phase and
reconfirmed in FASE 18/19 — 2 unrelated suites (`application-pipeline`, `cv-import`) failed in that run and
both passed cleanly (20/20) when re-run standalone immediately after; `ats-ai.e2e-spec.ts` itself passed in
every single run, including inside the full suite. Frontend **7/7 new** (deterministic report rendering, AI
button + dynamic price, insufficient balance, empty state, generation + result rendering, per-report
filtering, error state), full frontend suite **220/222** (same 2 pre-existing, unrelated
`IntersectionObserver` failures), typecheck/lint clean across both apps, `nest build`/`next build` clean. Full
design in [ats-ai-engine.md](../architecture/ats-ai-engine.md).

## Phase Template Recommendation Engine (as implemented)

Audited read-only before implementation ("AUDITORIA — FASE 21: Template Recommendation Engine"), then built
directly against the price already given in the brief — no approval round needed this time, unlike ATS AI's
mid-phase correction. The audit's finding: `AIFeature.TEMPLATE_RECOMMENDATION` existed only as a reserved enum
key with **zero usage anywhere in the codebase** — the last remaining reserved key with a real, briefed use
case. Only `INTERVIEW` and `CV_IMPORT` remain deliberately dormant after this phase.

**Pricing**: 20 credits, given directly in the brief.

**The one absolute rule this phase could not violate**: never duplicate the Template Engine (Phase 11) — the
recommendation reads the existing `ResumeTemplate` catalog read-only and never writes template metadata or
applies a template to anything itself; "applying" a recommended template remains exclusively the existing
Phase 11 template-selection flow's job. A new `TemplateRecommendation` table was created (same rationale as
`CareerAdvice`/`LinkedInProfile`/`AtsAiAnalysis` — `AiRequest` stores no content, and the required `GET`
endpoints need somewhere real to read from), with `resumeVariantId`/`jobTargetId` as real, **nullable** FKs
(genuine relational data the row is about, unlike the loose `aiRequestId` pointer — nullable because, unlike
`AtsAiAnalysis`'s mandatory FK, a recommendation is explicitly allowed to run with neither input) and
`recommendations` stored as `Json` (nothing in it is ever individually mutated, matching ATS AI's precedent
rather than `OptimizationSuggestion`'s). Migration `20260830153800_template_recommendation_engine`, purely
additive.

**A genuine architectural addition, not just another feature**: the AI must only recommend templates by an id
taken verbatim from the real catalog embedded in its own prompt. The `responseValidator` closure cross-checks
every returned `templateId` against the real, already-fetched catalog and throws — triggering the same
automatic refund every other pipeline failure uses — the moment every returned id is fake, so an unusable
recommendation is never persisted and never silently charged. Making `DummyAIProvider`'s deterministic response
return _real_ ids (so the happy path is actually exercised, not just the refund path) required a new, genuinely
feature-agnostic prompt utility, `extractEntityIds()`, mirroring `extractArrayCount()`'s existing philosophy.
**A bug caught and fixed mid-phase**: the first version assumed UUID-shaped ids and failed every e2e happy-path
test, because `ResumeTemplate.id` values are stable, human-readable slugs (`'modern'`, `'ats-classic'`, etc.) by
deliberate design — confirmed directly in the seed file's own doc comment, not guessed. Rewritten to match any
literal `"id": "value"` JSON pair regardless of format — a strictly more correct, more genuinely generic
implementation, re-verified end to end (5 e2e failures → 11/11 passing).

Context is the closest yet to Career Advisor's/LinkedIn's shape — Master Resume (optional, gates whether
sections are fetched), an optional Resume Variant, an optional Job Target (explicit id takes precedence over
one derived from the Variant) — plus one addition none of the prior features needed: the full active template
catalog, always present, embedded as JSON directly into the prompt.

Frontend: **a new page**, `/dashboard/template-recommendations` — unlike ATS AI (integrated into an existing
page), this feature has no single natural host page, so it's linked from the sidebar/mobile nav
("Recomendação de Templates," in the "Candidaturas" group). Recommended templates render via the existing
`useResumeTemplate(id)` hook and `TemplateSwatch` component — full template metadata is fetched, never
duplicated from the recommendation response itself, which carries only `templateId`/`rank`/`score`/`reason`.
"Ver este template" links into the existing Resume Variant → template-selection flow; this page recommends,
it never applies.

Quality gate: backend unit **1132/1132** (47 new — prompt builder, response parser, repository, service,
controller, plus the new `extractEntityIds()` utility), backend e2e `template-recommendation.e2e-spec.ts`
**11/11** (happy path with real catalog ids, a dedicated `FakeTemplateIdProvider` test double proving the
fabricated-id → 422 → full refund → zero persisted rows path, invalid/cross-user `resumeVariantId`/
`jobTargetId` → 404 before any charge, insufficient credits, AiRequest tracking, idempotency, ownership, admin
bypass). A full 22-suite e2e run (`test:e2e`, 305 tests) showed 3 suites fail — `interview`, `cover-letter`,
`cv-import` — all 3 confirmed, by re-running them standalone immediately after, to be the same category of
pre-existing cross-suite flakiness already disclosed in the Payments & Credits/FASE 18/19/20 phases (a
leftover `feature_pricing` row from an earlier crashed suite, and a timeout unrelated to any file this phase
touched); all 3 passed cleanly (66/66) standalone, and `template-recommendation.e2e-spec.ts`/`ats-ai.e2e-spec.ts`/
`linkedin.e2e-spec.ts`/`career-advisor.e2e-spec.ts` themselves passed in every run, including inside the full
suite. Frontend **8/8 new** (loading state, credit cost, empty state, insufficient balance, history rendering,
full generate-and-render flow, error state) plus **1/1** nav-entry test, full frontend suite **228/230** (same
2 pre-existing, unrelated `IntersectionObserver` failures on the marketing page, confirmed unrelated by
inspecting the stack trace directly). Typecheck/lint clean across both apps (lint warnings are 100%
pre-existing `no-explicit-any` warnings in unrelated spec files, zero errors), `nest build`/`next build` clean
— the new route appears in the build's own page table:
`/dashboard/template-recommendations  8.42 kB  167 kB`. Full design in
[template-recommendation-engine.md](../architecture/template-recommendation-engine.md).

## Phase CV Import AI Engine (as implemented)

Audited read-only before implementation ("AUDITORIA — FASE 22: CV Import AI / Intelligent Extraction
Engine"), then blocked on a pricing decision (per PASSO 6) before implementing anything else — unlike every
prior AI phase, this one had a genuinely pre-existing, extensively documented design contract waiting for it:
`cv-import.md` §13f (Phase 12) had already sketched the exact `AiOrchestrationService.execute({ feature:
AIFeature.CV_IMPORT, ... })` integration, and `CvImport.creditsUsed` had been reserved in the schema since
Phase 10.5 specifically for this step, still always `0`. The audit also found a per-entry deterministic
confidence mechanism already built (`CvDraftMeta.confidence`, `lib/cv-import/confidence.ts`'s
`getEntryConfidenceTier()`, HIGH/MEDIUM/LOW at the exact thresholds PASSO 5 asked for) — reused as-is, no new
confidence concept introduced.

**Pricing decision**: 30 credits, approved by the user at this phase's mandatory decision checkpoint — no
price for `AIFeature.CV_IMPORT` had ever been documented or approved anywhere in the codebase; every existing
mention (cv-import.md, credit-architecture.md) explicitly said pricing was a deliberately deferred product
decision, confirmed by exhaustive grep before presenting the checkpoint. 30 matches Career Advisor/LinkedIn/
ATS AI's "interpretation of already-available data" category, not a heavier full-content-generation task like
Resume Optimization (80) or Cover Letter (40).

**The one absolute rule this phase could not violate**: the AI may only propose a REVISION to a field the
deterministic `CVParser` already found — never invent a value for an empty field, and never write to Profile/
Master Resume/sections itself. Confirmed structurally two ways: (1) `CvImportPromptBuilder` embeds an
`ELIGIBLE_FIELDS_JSON` block listing only already-extracted, non-empty fields, computed by a new
`buildEligibleFields()`/`getFieldValue()` pair in `cv-import-ai-validator.ts`; (2) after the AI responds, the
SAME functions cross-check every returned suggestion against the real draft — a suggestion targeting a field
that doesn't exist or is empty is silently dropped, and the real current value is always substituted as
`originalValue`, never the AI's own echo of it (throwing, and triggering the standard refund, only if
literally every suggestion is invalid). `confirm()` itself required **zero backend changes** — it already
accepted a fully user-edited draft back since Phase 12, so accepting an AI suggestion is indistinguishable from
the user having typed the revision in by hand.

**A genuine architectural departure from FASE 18-21**: unlike every prior AI feature (each of which created a
brand-new table), this phase reuses the _existing_ `CvImport` row — three purely additive columns
(`aiSuggestions Json?`, `aiUnresolvedFields String[] @default([])`, `aiRequestId String?`), migration
`20260830171627_cv_import_ai_engine`. This was the design `CvImport.creditsUsed`'s own comment had anticipated
since Phase 10.5, not a new decision. A naming collision was caught and fixed during implementation: the wire
contract's array had to be renamed `fieldSuggestions` (not `suggestions`) to avoid silently colliding with
Resume Optimization's own differently-shaped `suggestions` field inside `DummyAIProvider`'s one shared JSON
envelope — the same precedent Template Recommendation (FASE 21) established for its own field naming.
`DummyAIProvider` gained a matching `extractCvImportEligibleFields()` capability, mirroring FASE 21's
`extractEntityIds()` philosophy against a richer per-field shape.

Frontend: **no new page** — per this phase's own "preserve CV Import" rule, integrated directly into the
existing `/dashboard/import-cv` review screen as a new, self-contained `CvImportAiSuggestions` component
rendered _alongside_ (never inside) the pre-existing, already-tested 900-line `CvImportReview` component, which
needed zero changes. Reuses `getEntryConfidenceTier()` for the confidence badge and Resume Optimization's own
established original-struck-through/suggested-in-green visual convention. Accepting a suggestion calls a small
pure function, `applyCvImportAiSuggestion()`, folding the revision into the exact same `reviewData` state the
user's own manual edits already write to.

Quality gate: backend unit **1191/1191** (72 new — prompt builder, response parser, validator, service,
repository, controller), backend e2e `cv-import-ai.e2e-spec.ts` **14/14** (valid extraction, partial CV,
suggestions grounded in real fields only, invalid/non-existent id → 404 before any charge, cross-user
ownership, insufficient credits, already-confirmed-import rejection, AiRequest tracking, invalid-JSON refund,
provider-failure refund, idempotency, admin bypass, Master Resume untouched before confirmation and correct
after it). A full 23-suite e2e run initially showed widespread failures traced to a self-inflicted cause — a
standalone verification run was still executing concurrently against the same database, causing
`feature_pricing` unique-constraint collisions across multiple unrelated suites; re-run cleanly and in
isolation, the full suite passed **20/23 suites (288/319 tests)** outright, with exactly 3 failures
(`cv-import`, `cv-import-ai`, `linkedin`) — all traced to the same pre-existing, already-documented
cross-suite flakiness disclosed in every prior phase's report this session (a PDF-parsing timing sensitivity
under sustained `--runInBand` load, and the recurring `feature_pricing` unique-constraint collision), confirmed
by re-running all 3 standalone immediately after: **36/36 passing**, including `cv-import-ai.e2e-spec.ts`
itself in every single run. Frontend **17/17 new** (`CvImportAiSuggestions`: availability, live pricing,
insufficient balance, generate flow, error state, empty state, confidence/original-vs-suggested rendering,
accept, reject, unresolved-fields notes; `apply-ai-suggestion.ts`: 6 pure-function tests) plus **7 existing
`import-cv/page.test.tsx` tests updated** for the new credit-estimate fetch call the review screen now issues,
full frontend suite **243/245** (same 2 pre-existing, unrelated `IntersectionObserver` failures on the
marketing page). Typecheck/lint clean across both apps (one real lint error caught and fixed during this phase
— an async generator with no reachable `yield` in a test double — everything else pre-existing
`no-explicit-any` warnings), `nest build`/`next build` clean — `/dashboard/import-cv` grows from ~14 kB to
15.6 kB in the build's own page table, confirming the new panel is bundled. Full design in
[cv-import-ai.md](../architecture/cv-import-ai.md).

## Phase 0 Readiness

As of this pass, the open architectural questions that would have blocked confident Phase 0 scaffolding are resolved: `prompts/` path structure, CV data model, test retake policy, AI request tracking, credit-failure/refund rule, soft-delete scope, admin MFA extensibility, token storage, PII classification/retention, payment provider abstraction, credit/payment separation, domain events, full database entity list, and credit package/feature pricing configuration. See the architecture assessment for the full resolution list. Phase 0 (repo scaffolding, TypeScript/lint/format config, Prisma+PostgreSQL wiring, Docker, test runner config) can now begin without further product decisions blocking it.
