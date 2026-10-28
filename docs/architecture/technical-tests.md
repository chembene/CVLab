# CVLab AI — Technical Tests Engine

Status: **implemented, FASE 23 (2026-09-12)**. The original roadmap's Phase 9 "Tests" requirement (`prompts/14-development-roadmap.md`: _"Test categories, Question bank, Test sessions, Timer, Answers, Score, Explanations, History"_) — the only reserved capability from the roadmap's own Phase 0-16 list that had never been built. **100% deterministic, zero AI, zero credits** — deliberately the first feature this session builds with no dependency at all on `AiOrchestrationService`, `CreditService`, or any `AIFeature` key, matching the roadmap's own design (Phase 9 "Tests" never mentions AI; Phase 10 "Interview Practice" is the AI-evaluated capability, a genuinely separate, already-shipped feature this module never duplicates).

## 0. Audit finding — the schema already existed, dormant, since before this session

Before writing any code, an exhaustive audit found `Test`, `Question`, `TestSession`, and `TestAnswer` already fully modeled in `prisma/schema.prisma` — complete with every field the roadmap's Phase 9 list needs (`Test.category`/`.timeLimit`, `Question.choices`/`.correctAnswer`/`.explanation`, `TestSession.attemptNumber`/`.status`/`.score`, `TestAnswer.selectedAnswer`/`.isCorrect`) and both `User`/`Test` reverse relations already wired. **Zero backend code anywhere referenced these models** (confirmed by grepping for `TestService`/`TestController`/`TestRepository`/`prisma.test.`/`prisma.question.` — no hits) and **zero frontend code** referenced a test-taking UI — this was a pure schema scaffold, exactly like the pre-existing `Cv`/`CvVersion` placeholder tables the codebase's own comments already document as "schema-only, never implemented." This phase builds the entire service/repository/controller/frontend layer on top of that already-correct schema, changing only what was genuinely missing.

## 1. Why a second "Tests" system was not created

The docs/architecture layer already anticipated this module under the name "Tests" (`module-boundaries.md`'s pre-existing row: _"Question bank, test definitions, test sessions, scoring, timers"_; `api-overview.md`'s pre-existing conceptual route list: `/tests`, `/tests/:id`, `/tests/:id/start`, `/test-sessions/:id/answer`, `/test-sessions/:id/complete`, `/test-sessions/:id/result`). This phase implements exactly that pre-documented contract — no second, parallel test system was ever considered, and Interview Practice (a genuinely different feature: AI-generated open-ended questions, AI-evaluated free-text answers, no multiple choice, no fixed correct answer) is untouched.

|                 | Technical Tests (FASE 23)                   | Interview Practice (Phase 9/FASE 11)                    |
| --------------- | ------------------------------------------- | ------------------------------------------------------- |
| Question source | Fixed, pre-written multiple-choice bank     | AI-generated per session                                |
| Answer format   | Select one of N fixed choices               | Free-text                                               |
| Scoring         | Deterministic exact-match                   | AI-evaluated (0-100 judgment)                           |
| Costs credits   | ❌ Never                                    | ✅ Yes (`INTERVIEW_QUESTIONS*`/`INTERVIEW_EVALUATION*`) |
| Calls AI        | ❌ Never                                    | ✅ Yes, via `AiOrchestrationService`                    |
| Retakes         | Every attempt its own row (`attemptNumber`) | Not modeled as repeatable attempts                      |

## 2. Backend module

`apps/api/src/tests/`:

```
tests.repository.ts                 Only Prisma access for tests/questions/test_sessions/test_answers
tests.service.ts                    listAvailable / getTest / startSession / submitAnswer / completeSession / getOne / getResult / listSessions
tests.controller.ts                 /api/v1/tests/*        (catalog: list, detail, start)
test-sessions.controller.ts         /api/v1/test-sessions/* (session lifecycle: list, get, result, answer, complete)
tests.module.ts                     Imports only AuthModule — no AiOrchestrationModule, no CreditsModule
test-timer.util.ts                  computeRemainingSeconds() / isSessionExpired() — server-authoritative, pure functions
test-scoring.util.ts                isAnswerCorrect() / computeScorePercentage() — deterministic, pure functions
technical-test-view.builder.ts      sanitizeQuestion() / buildSessionView() — the ONE place "reveal answers only once COMPLETED" is decided
dto/submit-test-answer.dto.ts
interfaces/technical-test.interface.ts
seed/technical-tests.seed.ts        The shipped catalog — 3 tests, 13 questions, across Programming/SQL/Data
```

`TestsService` has no constructor dependency on `AiOrchestrationService`, `CreditService`, `ProviderRegistry`, or any `AIProvider` — structurally impossible for this module to charge credits or call AI, mirroring the same "the constructor signature enforces the boundary" pattern every prior AI feature uses in reverse.

## 3. Main flow

```
GET /tests[?category=]              — catalog, active tests only, optional category filter
GET /tests/:id                      — one test's summary (title/category/timeLimit/questionCount)
POST /tests/:id/start               — creates a new TestSession (attemptNumber = prior attempts + 1)
                                       returns every question WITHOUT correctAnswer/explanation
  ↓
POST /test-sessions/:id/answer      — upserts one TestAnswer (editable until completion), scored
                                       immediately but never revealed in the response
  ↓ (repeat per question, any order, any number of times per question)
POST /test-sessions/:id/complete    — sums already-computed isCorrect flags → score (0-100) →
                                       status COMPLETED. Closes the attempt exactly once (atomic
                                       compare-and-set); a second submit gets 409. After the deadline
                                       it is honoured as the automatic close (see §4).
  ↓
GET /test-sessions/:id/result       — full result: every question now WITH correctAnswer/explanation
GET /test-sessions                  — the caller's own attempt history, most-recent-first
```

Retakes are unrestricted — starting the same test again always creates a new `TestSession` row (`@@unique([userId, testId, attemptNumber])`), never overwrites a prior attempt, exactly matching the schema's own pre-existing doc comment ("Retakes allowed — every attempt is its own row").

## 4. Timer — server-authoritative

`Test.timeLimit` is denominated in **minutes** (undocumented before this phase; this is the convention it establishes). No timer infrastructure existed anywhere else in the codebase to reuse (confirmed by audit). `computeRemainingSeconds()`/`isSessionExpired()`/`sessionDeadline()` (`test-timer.util.ts`) compute everything fresh from `TestSession.startedAt` (persisted, immutable once a session starts) — **the server never trusts a client-reported elapsed/remaining time**. A test with `timeLimit: null` never expires. The frontend's own visible countdown is a **display convenience only**, seeded from the server's `remainingSeconds` and ticking down locally in JS; when it reaches zero it just refetches the session, and the server's own checks are what actually matter.

**Automatic close at the deadline.** When the time limit runs out the attempt is closed and scored by the server, using the answers saved before the deadline; unanswered questions count as incorrect. There is no background job (none exists in this codebase, and none is needed): the close is **lazy** — the first request that touches an overdue `IN_PROGRESS` attempt performs it (`TestsService.settleIfExpired()`), and that includes the attempt-history list, so abandoned attempts show up as completed, with a score, the next time the user looks at their history. The result is persisted: `status = COMPLETED`, `score`, and `completedAt` stamped with the **deadline itself** (not the time of the request). `timedOut` (`completedAt >= deadline`, derived by `wasTimedOut()`, no extra column) tells the UI the clock closed it. A user submit that arrives after the deadline is honoured as that same automatic close. Correct answers and explanations are revealed only once the attempt is `COMPLETED`, i.e. never on an attempt that is still open. Attempts that were already overdue and unscored when this behaviour shipped are closed the same way on first access; scores already computed are never recalculated.

**Concurrency and idempotency.** Four writers can race on one attempt: a manual submit, the automatic close, a last answer, and repeated submits. Two repository operations make that safe, both using the conditional-`updateMany`-inside-`$transaction` pattern `CreditService` already uses (no raw SQL, no new locking primitive): `completeSessionIfOpen()` flips `IN_PROGRESS → COMPLETED` with `WHERE status = 'IN_PROGRESS'`, so of any number of concurrent callers exactly one gets `count: 1`, computes the score from the answers visible once it holds the session row lock, and emits the history event; every other caller gets `null` (a manual submit then answers 409, an automatic close just re-reads). `saveAnswerIfOpen()` takes the same row lock with a conditional update on `status = 'IN_PROGRESS' AND startedAt > now - timeLimit` before upserting, so an answer is either committed before the close (and scored) or finds the attempt closed or late and writes nothing — never saved-but-unscored or scored-but-unsaved. A closed attempt cannot be answered or submitted again (409).

## 5. Scoring — deterministic, never AI

`isAnswerCorrect()` is an exact (case-sensitive) string match against `Question.correctAnswer` — an unanswered question (`selectedAnswer: null`) always scores as incorrect, never excluded from the total. `computeScorePercentage()` is a plain rounded percentage. No AI call, no `AiOrchestrationService`, no judgment call — per the brief's explicit "Do not use AI for ordinary multiple-choice scoring."

## 6. "Never expose correct answers before submission"

Structurally enforced in exactly one place: `technical-test-view.builder.ts`'s `buildSessionView()` decides `revealAnswer = status === 'COMPLETED'` once, and `sanitizeQuestion()` only ever includes `correctAnswer`/`explanation`/a truthful `isCorrect` when that's true. Every response path (`start`, `answer`, `getOne`) reuses the exact same builder — there is no second code path that could accidentally leak an answer early. `isCorrect` is computed and persisted immediately at answer-submission time (so scoring itself is real-time and cheap), but the API response for `submitAnswer()` still shows `isCorrect: null` until the session is completed — computing early and revealing late are deliberately decoupled.

## 7. Credits — free by design, no price invented

Per the brief's own explicit instruction (§5) and this phase's audit of `docs/architecture/credit-architecture.md`: no price for a "technical test" feature has ever been documented, seeded, or approved anywhere in this codebase — the phrase "technical test scoring" appears exactly once, as a generic illustrative example in a sentence about credit-consuming features in general, never in the real pricing table. The original roadmap's own Phase 9 spec (`prompts/14-development-roadmap.md`) never mentions credits at all. This capability is **free**, matching the exact precedent already established by every other 100%-deterministic engine in this codebase — ATS Analysis, CV Import's own deterministic extraction, and Job Import — none of which charge, none of which have an `AIFeature` key. No `feature_pricing` row was created; no price was invented; nothing was hardcoded in the frontend (there is no cost indicator in the UI at all, since there is no cost).

## 8. Persistence

No new table — the dormant `Test`/`Question`/`TestSession`/`TestAnswer` models already covered every field the roadmap asked for. Exactly one additive migration, `20260909181056_technical_tests_engine`:

```sql
ALTER TABLE "test_answers" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL;
CREATE UNIQUE INDEX "test_answers_test_session_id_question_id_key" ON "test_answers"("test_session_id", "question_id");
```

Both changes were applied to a table with **zero rows in any environment** (confirmed via direct query before migrating) — the unique constraint is what turns "one answer per question per session, editable until completion" into a real database-backed upsert (`TestsRepository.upsertAnswer()`) instead of an application-level race condition; `updatedAt` matches every other mutable row in this schema. `TestSession.status` deliberately stays a raw `String` column (unlike every other status-like column in this schema, which are real Postgres enums) — a pre-existing inconsistency in the dormant scaffold this phase chose not to touch via a non-trivial `ALTER TYPE` migration; the fixed set of valid values (`'IN_PROGRESS' | 'COMPLETED'`) is enforced at the application layer instead (`TestSessionStatus` in `technical-test.interface.ts`).

## 9. Seed data

`apps/api/src/tests/seed/technical-tests.seed.ts` — 3 tests (Fundamentos de Programação, SQL Básico, Análise de Dados; Programming/SQL/Data categories), 13 questions total, stable slug ids (`tt-programming-fundamentals`, etc. — same "human-readable, idempotent-upsert" convention `resume-templates.seed.ts` established in Phase 11). `prisma/seed-technical-tests.ts` upserts this catalog; run via `npm run db:seed:technical-tests`. `tests.e2e-spec.ts` never depends on this shared catalog for its own assertions — it creates and tears down its own dedicated fixture tests, so the suite passes whether or not the seed script has been run against that database.

## 10. Frontend

`/dashboard/technical-tests` — catalog + attempt history (category filter, "Iniciar Teste" button per test, a history list linking back into any past attempt). `/dashboard/technical-tests/:id` — the session page, driven entirely by `TestSessionView.status`: while `IN_PROGRESS`, shows the live countdown (when timed), each question as a clickable multiple-choice card, and a "Submeter Teste" button; while the time is up and the server close is pending, shows "Tempo esgotado" with the submit button disabled, then refetches; once `COMPLETED` (by submit or by the clock — a notice says which), shows the score badge and every question with its correct answer, the user's own choice, and its explanation. No credit-cost indicator anywhere (§7). Reused components: `PageHeader`, `Card`, `Badge`, `Button`, `Skeleton`, `EmptyState`, `ErrorState`, `StatusBadge`, `ScoreBadge`, `Alert`, `Select` — no new low-level UI primitive was introduced.

## 11. Security

Authenticated users only (`JwtAuthGuard`) on every route. Catalog browsing (`GET /tests`, `GET /tests/:id`) has no per-user ownership concept — any authenticated user may browse. Every session-lifecycle route enforces `assertOwnerOrAdmin` plus an ownership-checked lookup; a cross-user or non-existent session id returns 404, never 403 — confirmed by a dedicated e2e test. `POST /test-sessions/:id/answer` and `POST /test-sessions/:id/complete` carry a stricter-than-default `@Throttle()` override (30/60s and 10/60s respectively, vs. the app-wide 100/60s default) — matching `api-overview.md`'s own pre-documented "Strong rate limit on submission" note and the exact pattern `AuthController`/`ExportController` already use, no new rate-limiting mechanism.

## 12. History integration

Reuses the existing generic `ResumeEntityChangedEvent`/`RESUME_ENTITY_CHANGED_EVENT` bus unchanged — `HistoryListener` needed zero code changes, since `entityType` is already a plain string and every `action` this module emits (`started`, `submitted`, `completed`) already existed in `ResumeEntityAction`'s union. `entityType` values: `technical_test_session` (start/complete) and `technical_test_answer` (each answer submission). `GET /test-sessions` is a second, complementary, domain-specific "my own attempts" list — the same pattern every other feature's own `GET /list` endpoint already follows, not a second history system.

## 13. Idempotency / refund

Not applicable — this module never touches `AiRequest`, `CreditTransaction`, or any credit/AI idempotency key, since it never calls `AiOrchestrationService`. The one real "double-submission" concern (resubmitting the same answer) is handled by the `@@unique([testSessionId, questionId])` upsert (§8), not an idempotency-key mechanism.

## 14. Known limitations

- Content is a small, hand-written seed catalog (13 questions across 3 tests) — no admin UI exists yet to author new tests/questions (out of this phase's scope; a future Admin Dashboard phase's natural extension).
- No cap or cooldown on retakes — a user may start unlimited attempts at the same test.
- `TestSession.status` stays a raw `String` column rather than a real Postgres enum (§8) — a pre-existing schema inconsistency deliberately left alone rather than risking an unrelated `ALTER TYPE` migration.
- The automatic close is lazy: an attempt nobody ever reads again stays `IN_PROGRESS` in the database (the user sees it closed and scored the next time they open it or their history). If something outside the user's own requests ever needs it closed on time (e.g. an admin report over raw rows, or a notification), a periodic job would be the follow-up — no reusable scheduler exists today (no `@nestjs/schedule`/queue in the repo).
- The deadline is evaluated against the API server's clock; in a multi-instance deployment instance clocks are assumed synchronised (NTP). The answer guard re-checks the deadline inside the write, so it is not subject to read-then-write races, only to clock skew.
- The visible countdown is a client-side display convenience seeded once from the server; it does not itself re-sync mid-session if the tab is backgrounded for a long time — the server's own independent expiry check is what actually protects the timer, so this is a UX polish item, not a security gap.
