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
3. **History (Phase 11) and Notifications (Phase 13) are both "read/observe" concerns that touch every prior module.** Building them *after* Phases 3–10 exist (so there are real events to observe) is correct; however, if history/notification hooks are bolted on retroactively to five already-built modules, that's more invasive than adding an event hook at each module's original build time. **Resolved:** the domain-event architecture in [system-architecture.md](../architecture/system-architecture.md) §4 formalizes this — each module emits its own typed events starting in Phase 3, and History/Notifications/Analytics attach as listeners in Phase 11/13 without touching the emitting modules' code.
4. **Admin Dashboard (Phase 12) depends on nearly everything (Phase 1–10)** — its position after them is correct and required.

## No changes required to phase order itself

The roadmap does not need restructuring. The one actionable recommendation is #3 above (emit domain events early rather than retrofitting), which is an implementation-detail note for whoever builds Phases 3–10, not a roadmap change.

## Definition of Done / Review Gate (unchanged, restated for visibility)

Every milestone must produce: working code, tests, documentation, migrations (if any), API docs, changelog update — and passes an architecture/code-quality/database/security/tests/performance/documentation review gate before the next phase starts (`prompts/14-development-roadmap.md` §5–6). This applies starting with Phase 0.

## Phase 0 Readiness

As of this pass, the open architectural questions that would have blocked confident Phase 0 scaffolding are resolved: `prompts/` path structure, CV data model, test retake policy, AI request tracking, credit-failure/refund rule, soft-delete scope, admin MFA extensibility, token storage, PII classification/retention, payment provider abstraction, credit/payment separation, domain events, full database entity list, and credit package/feature pricing configuration. See the architecture assessment for the full resolution list. Phase 0 (repo scaffolding, TypeScript/lint/format config, Prisma+PostgreSQL wiring, Docker, test runner config) can now begin without further product decisions blocking it.
