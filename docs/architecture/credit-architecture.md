# CVLab AI — Credit Architecture

Status: resolved decision (approved 2026-07-30). Supersedes the "Credits never depends on Payments" summary in [module-boundaries.md](module-boundaries.md) with full detail, and resolves the credit-consumption-failure rule flagged as an open question in the prior pass.

## 1. Principle

Credits are internal usage units, not money (`prompts/11-credit-system.md` §1). The Credits module is the **sole authority** over wallet balances and the transaction ledger. It has zero dependency on any payment provider — it only knows "allocate N credits to user U for reason R," never "how did the money arrive."

```
Payments  ──confirms money received──▶  calls Credits.allocate(...)
Credits   ──never calls──▶  Payments / any PaymentProvider
```

## 2. Credit Entry Points (Transaction Types)

Credits can enter a wallet through exactly these ledger transaction types (`prompts/11-credit-system.md` §6):

| Type | Trigger | Who initiates |
|---|---|---|
| `PURCHASE` | A `PaymentCompleted` domain event for a completed payment | Payments (via event) → Credits |
| `BONUS` | Bundled with a `PURCHASE` for packages that include bonus credits (e.g. package 2: 450 base + 100 bonus) | Credits, at purchase time |
| `PROMOTION` | Marketing/promotional grant | Admin-triggered, audited |
| `ADMIN_ADJUSTMENT` | Manual correction | Admin-triggered, audited, requires reason |
| `REFUND` | A previously consumed operation is refunded per §4 below | Feature module (via Credits' refund method), or Admin |
| `REVERSAL` | A previously granted `PURCHASE`/`BONUS` is reversed (e.g. charge dispute) | Admin/Payments-triggered, audited |

`CONSUMPTION` (feature usage) and `EXPIRATION` (architecture-only, disabled in MVP per `prompts/11-credit-system.md` §13) round out the full type list from the source rules.

**Money logic and credit logic are never mixed in the same service method.** Payments decides "is this transaction financially valid" (provider verification, idempotent-by-reference). Credits decides "how many credits does this event grant" (package lookup, bonus calculation). The boundary is a single call: `Payments` → `Credits.allocateFromPurchase(userId, packageId, paymentId)`, where `Credits` looks up the package's `total_credits` itself — Payments never computes or passes a raw credit number.

## 3. Wallet + Ledger

- `credit_wallets`: one row per user — `available_credits`, `lifetime_credits_purchased`, `lifetime_credits_consumed`. Never negative.
- `credit_transactions`: append-only ledger, the system of record (`prompts/11-credit-system.md` §20 "Golden Rule"). Every wallet mutation happens **only** as a side effect of inserting a ledger row inside the same DB transaction — the wallet balance is a derived/cached total, never updated independently.
- Every credit-consuming operation carries an **idempotency key**; the same key can never deduct credits twice (`credit_transactions.idempotency_key` is unique).

## 4. Credit Consumption Failure Rule (resolved)

**Rule:** if the platform fails for an internal/technical reason, the user's credits are never lost. If the user's input is invalid, credits should not have been charged in the first place.

Concretely, using the RESERVE → PROCESS → COMMIT/RELEASE pattern from `prompts/11-credit-system.md` §10:

1. **Validate input first.** Obviously invalid input (missing required CV fields, empty job description for ATS, etc.) is rejected by the controller/service **before** any credit reservation happens. No reservation is created for input that fails basic validation — so there is nothing to refund.
2. **Reserve, then process.** Once input passes validation, the feature service reserves the credit cost (`RESERVE`), then calls the external dependency (OpenAI, etc.).
3. **On success:** `COMMIT` — the reservation becomes a `CONSUMPTION` transaction.
4. **On platform-caused failure** (OpenAI unavailable, internal server error, DB transaction failure, platform-side timeout, unexpected provider failure): `RELEASE` the reservation — no `CONSUMPTION` transaction is written, or if credits were already committed, a `REFUND` transaction is created. Either path nets to zero cost to the user. This is unconditional — the user is never charged for a failure that was not their fault.
5. **On failure caused by valid-but-unproductive input** (e.g. AI ran but the job description was too short to produce a meaningful ATS analysis): this is a per-feature judgment call under `prompts/10-business-rules.md` §6 ("credits may be consumed only if the platform has already performed meaningful processing"). Default posture: if the external AI call was actually made and returned a response (even a low-quality one), the credit is consumed — the platform did the work it promised. If the AI call itself never happened (blocked before dispatch), it is treated as a platform failure per step 4, not a user-input failure.

**Per-feature documentation requirement:** each credit-consuming feature (CV improvement, cover letter, ATS analysis, CV translation, interview practice, technical test scoring) must document, at implementation time, its specific boundary between "invalid input, never charged" and "processed but low quality, charged" — and that boundary must be covered by tests (insufficient balance, exact balance, provider failure mid-call, timeout, duplicate request — per `prompts/11-credit-system.md` §19). This document establishes the rule; feature-level docs implement it.

## 5. Credit Package & Feature Pricing Configuration

Both are **database-backed configuration**, never hardcoded in frontend code or scattered through backend business logic (`prompts/11-credit-system.md` §4, `prompts/00-rules.md`). The backend is the authoritative source; the frontend only displays what `GET /credits` and package-listing endpoints return.

### Initial `credit_packages` seed data

| Package | Price (MT) | Base credits | Bonus credits | Total credits |
|---|---|---|---|---|
| 1 | 100 | 200 | 0 | 200 |
| 2 | 250 | 450 | 100 | 550 |
| 3 | 500 | 1000 | 200 | 1200 |
| 4 | 1000 | 2000 | 600 | 2600 |
| 5 | 2000 | 4000 | 1500 | 5500 |

### Initial `feature_pricing` seed data

| Feature | Cost (credits) |
|---|---|
| CV improvement suggestion | 30 |
| CV creation | 40 |
| Cover letter | 25 |
| CV translation | 20 |
| ATS analysis | 35 |
| Professional summary | 20 |
| Career suggestion | 15 |
| Interview practice | 60 |
| Technical test | 40 |
| PDF premium export | 10 |

These are **seed/initial values** for the `credit_packages` and `feature_pricing` tables, loaded via a seed script at Phase 3 implementation time — not constants embedded in code. Admins can change them through an audited update path; price changes never retroactively affect already-completed payments or already-charged consumptions (the ledger row captures the cost/amount at the time of the transaction, immutably).

## 6. Security Invariants (restated from source rules, non-negotiable)

- Users cannot modify their own balance under any circumstance.
- The frontend is never trusted for cost/balance calculations — it only displays what the backend returns.
- Every wallet mutation traces to exactly one ledger row; the ledger is authoritative if the two ever disagree (which should be structurally impossible given §3).
