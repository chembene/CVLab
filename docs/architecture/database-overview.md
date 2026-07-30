# CVLab AI — Database Overview (Conceptual)

Status: resolved decisions (approved 2026-07-30) — conceptual entity list for MVP scope. **Not a Prisma schema — that is Phase 0 implementation work.** Per `prompts/04-database-rules.md`: PostgreSQL, plural snake_case tables, snake_case columns, every table has `id`, `created_at`, `updated_at`; FKs/indexes/constraints always defined; transactions mandatory for payments/credits/orders.

## 1. Entities

| Entity (table) | Purpose | Key fields | Relationships | Indexes | Notes / Risks |
|---|---|---|---|---|---|
| `users` | Account identity | email (unique), phone (unique, nullable), password_hash, status, role, deleted_at | 1—N: profiles, cvs, wallets, payments | partial unique(email) WHERE deleted_at IS NULL; partial unique(phone) WHERE deleted_at IS NULL | Soft-deleted (§3) |
| `profiles` | Professional profile | user_id, headline, education[], skills[], experience[], social_links[], photo_url | 1—1 users | unique(user_id) | Soft-deleted (§3). Content shape may follow the same structured-JSON approach as CVs (see [cv-data-model.md](cv-data-model.md)) rather than child tables, for the same evolvability reasons |
| `cvs` | CV identity/pointer record — holds no section content itself | user_id, title, template_id, current_version_id, status, deleted_at | 1—N cv_versions | user_id | Soft-deleted (§3). Full model in [cv-data-model.md](cv-data-model.md) |
| `cv_versions` | Structured CV content, JSONB, append-only | cv_id, version_number, schema_version, content (JSONB), created_by | N—1 cvs | unique(cv_id, version_number) | Never soft-deleted or mutated — restoring creates a new version. See [cv-data-model.md](cv-data-model.md) |
| `credit_wallets` | Per-user credit balance (derived/cached total) | user_id (unique), available_credits, lifetime_purchased, lifetime_consumed | 1—1 users | unique(user_id) | Never soft-deleted (lives/dies with the user record only at a legal/GDPR-style deletion, out of MVP scope). See [credit-architecture.md](credit-architecture.md) |
| `credit_transactions` | Immutable, append-only credit ledger — system of record | user_id, amount, type (PURCHASE/BONUS/CONSUMPTION/REFUND/ADMIN_ADJUSTMENT/EXPIRATION/PROMOTION/REVERSAL), balance_before, balance_after, reference, description, actor, metadata, idempotency_key | N—1 users; optionally references payments/ai_requests via `reference` | unique(idempotency_key); index(user_id, created_at) | **Never physically or soft deleted, ever** (§3). See [credit-architecture.md](credit-architecture.md) |
| `credit_packages` | Purchasable credit bundles, admin-configurable | price_mt, base_credits, bonus_credits, total_credits, active | 1—N payments | — | Seed values in [credit-architecture.md](credit-architecture.md) §5. Price changes never retroactively affect completed payments |
| `feature_pricing` | Configurable cost per paid feature | feature_key (unique), cost, active | referenced by AI/Tests/Interviews at charge time | unique(feature_key) | Cached (Redis) with invalidation on admin update. Seed values in [credit-architecture.md](credit-architecture.md) §5 |
| `payments` | Payment intents/records | user_id, package_id, provider, provider_reference, amount, currency, status, timestamps, metadata | N—1 users, credit_packages; 1—1 credit_transactions (on completion) | **unique(provider, provider_reference)**; index(user_id) | Never physically deleted — payments remain auditable (§3). See [payment-architecture.md](payment-architecture.md) |
| `ai_requests` | AI usage/cost/audit tracking | user_id, feature, status, model, request_id, input_tokens, output_tokens, total_tokens, estimated_cost, credits_charged, duration_ms, created_at, completed_at, error_code, metadata | N—1 users; cross-referenced with credit_transactions via `reference` | index(user_id); index(feature, created_at); index(status) | Full spec in [ai-architecture.md](ai-architecture.md). Never stores secrets or raw transcripts by default |
| `tests` | Test definitions | title, category, time_limit, active | 1—N questions, test_sessions | index(category) | Soft-deleted (admin-managed content, §3) |
| `questions` | Question bank, independent from sessions (`prompts/10-business-rules.md` §13) | test_id, prompt, choices[], correct_answer, explanation | N—1 tests | index(test_id) | Soft-deleted (admin-managed content, §3). Correct answers never exposed via user-facing GET endpoints |
| `test_sessions` | One attempt at a test — **retakes allowed, each attempt stored separately** | user_id, test_id, attempt_number, started_at, completed_at, score, status | N—1 users, tests; 1—N test_answers | unique(user_id, test_id, attempt_number); index(user_id, test_id) | Resolved retake policy (§2). Never overwritten |
| `test_answers` | Per-question answers within one session | test_session_id, question_id, selected_answer, is_correct | N—1 test_sessions; N—1 questions | index(test_session_id) | Split out from `test_sessions` so an attempt's answers are queryable/reviewable independently |
| `interviews` | Interview practice session | user_id, status, overall_score, started_at, completed_at | N—1 users; 1—N interview_questions | index(user_id) | |
| `interview_questions` | Question + answer + evaluation within one interview session | interview_id, question_text, user_answer, evaluation, score, order | N—1 interviews | index(interview_id) | Split out from `interviews` for the same reason as `test_answers` — large per-question AI evaluation content shouldn't bloat the parent row |
| `notifications` | In-app notifications | user_id, type, payload, read_at | N—1 users | index(user_id, read_at) | |
| `history_events` | Centralized activity log | user_id, event_type, entity_ref, metadata, created_at | N—1 users | index(user_id, created_at) | High write volume — needs a partitioning/retention plan before launch scale, flagged as an infra risk, not a data-model gap |
| `admin_users` | Admin-specific extension data — **not a second identity table** | user_id (unique FK → users, where role IN (ADMIN, SUPER_ADMIN)), permissions (structured), mfa_enabled, mfa_method, last_admin_action_at | 1—1 users | unique(user_id) | Design decision: admin identity/credentials still live in `users` (single source of truth for auth); `admin_users` only holds admin-specific extension fields (fine-grained permissions beyond the role enum, and the MFA fields from [security-architecture.md](security-architecture.md) §1.2). Avoids maintaining two parallel identity records for the same person |
| `audit_logs` | Admin/system audit trail | actor_id, action, target_type, target_id, before, after, reason, created_at | N—1 users (actor) | index(actor_id, created_at) | **Append-only — never deleted through normal application flows** (§3) |

## 2. Test Retake Policy (resolved)

Users may repeat tests; every attempt is stored as its own `test_sessions` row (`attempt_number` incrementing per `(user_id, test_id)`), never overwritten. `test_answers` rows belong to one specific session/attempt.

Display requirements, all computable without denormalization:

- **Latest attempt**: `test_sessions` for `(user_id, test_id)` ordered by `attempt_number DESC LIMIT 1`.
- **Best attempt**: same set ordered by `score DESC LIMIT 1`.
- **Previous attempts**: full list ordered by `attempt_number`.

No column is needed to "mark" the best or latest attempt — both are derivable queries against the append-only `test_sessions` set, which avoids a second write path that could drift from the underlying data.

## 3. Soft Delete Policy (resolved)

Soft delete (`deleted_at`) is applied **only** where recovery, auditability, or a business requirement justifies it — not blindly on every table, per the approved decision.

**Soft-deleted (`deleted_at` present, excluded from normal queries by default):**
`users`, `profiles`, `cvs`, `tests`, `questions` (admin-managed content).

**Never physically or soft deleted through normal application flows (append-only, immutable):**
`credit_transactions`, `payments`, `audit_logs` — these are financial/audit records; per `prompts/04-database-rules.md` and `prompts/10-business-rules.md` §21, the ledger and payment history must remain permanently auditable. There is no `deleted_at` column on these tables at all — "delete" is not an operation that exists for them in the application layer. (A legally-mandated data-subject deletion request, if it ever applies to financial records, is a separate compliance process outside normal app flows, not modeled here.)

**Neither soft-deleted nor typically deleted (child/append-only records tied to a soft-deletable parent):**
`cv_versions`, `test_sessions`, `test_answers`, `interview_questions`, `history_events`, `notifications`, `credit_wallets` — these follow their parent's lifecycle (hidden when the parent user/CV is soft-deleted) rather than carrying independent delete semantics.

**`credit_packages` / `feature_pricing`:** use an `active` boolean, not `deleted_at` — deactivating a package/feature-cost is a configuration change, not a deletion of historical fact (past payments/consumptions still reference the package/cost as it was at the time).

## 4. Idempotency-Critical Unique Constraints (resolved, explicit)

These three are the highest-blast-radius constraints in the schema — getting them right at migration time is a hard requirement before Phase 3/4/6 implementation:

| Table | Constraint | Prevents |
|---|---|---|
| `credit_transactions` | `unique(idempotency_key)` | The same credit-consuming request deducting credits twice |
| `payments` | `unique(provider, provider_reference)` | The same provider transaction creating two payment records or two credit allocations |
| `ai_requests` | `unique(idempotency_key)` on the originating request (mirrors the feature-level idempotency key used for the paired `credit_transactions` row) | Duplicate-billed AI calls on client retry |

All three must be enforced as real database-level `UNIQUE` constraints (via Prisma's `@unique`/`@@unique`), not application-level checks alone — a race condition between a check and a write is exactly the failure mode these constraints exist to prevent.

## 5. Notes

- All money-adjacent tables (`payments`, `credit_transactions`, `credit_wallets`) are modified only inside a single DB transaction per operation, per `prompts/04-database-rules.md` §"Transactions" and `prompts/12-mpesa-integration.md` §12.
- No production Prisma schema is written yet — this remains intentionally conceptual (Phase 0 implementation work).
