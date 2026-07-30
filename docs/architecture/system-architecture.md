# CVLab AI — System Architecture

Status: **foundation decisions resolved, pre-Phase-0**. Source of truth for rules: [prompts/00-rules.md](../../prompts/00-rules.md) … [prompts/14-development-roadmap.md](../../prompts/14-development-roadmap.md), root [CLAUDE.md](../../CLAUDE.md).

## 1. Repository Status (as of 2026-07-30)

The repository is documentation-only — no application code, dependencies, or Prisma schema exist yet. As of this pass:

- Rule files live at `prompts/00-rules.md` … `prompts/14-development-roadmap.md` (corrected from the earlier `NN-name.md.txt` root-level layout — content verified byte-for-byte identical after the move).
- `CLAUDE.md` lives at repo root with the correct extension.
- Git is initialized (`git init`), no remote configured, nothing pushed. A `.gitignore` exists (node_modules, `.env*`, build output, Prisma generated client, logs).
- `docs/` contains the architecture/product/development documentation set (this file and its siblings).

**Classification: Empty repository (documentation-only), foundation-ready.** Phase 0 ("Project Foundation") has not started — no `apps/`, `packages/`, `prisma/`, `package.json`, or Docker config exist yet.

## 2. Target Stack (per CLAUDE.md and prompts/09-product-vision.md)

| Layer | Choice |
|---|---|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma (JSONB for structured document fields — see [cv-data-model.md](cv-data-model.md)) |
| Cache | Redis |
| Object storage | Cloudflare R2 |
| AI | OpenAI API (see [ai-architecture.md](ai-architecture.md)) |
| Auth | JWT + Refresh Tokens, bcrypt, RBAC (USER / ADMIN / SUPER_ADMIN), MFA-extensible (see [security-architecture.md](security-architecture.md)) |
| Payments | Provider abstraction; M-Pesa first (see [payment-architecture.md](payment-architecture.md)) |
| Credits | Fully provider-independent ledger (see [credit-architecture.md](credit-architecture.md)) |
| Frontend hosting | Vercel |
| Backend hosting | Docker |

## 3. Architecture Style

Clean Architecture / layered backend, enforced per `prompts/01-coding-standards.md`:

```
Controller  →  Service  →  Repository  →  Database
(HTTP only)    (business     (DB access
                rules)         only)
```

- Controllers: request/response mapping and validation trigger only, no business logic.
- Services: all business rules (credits, payments, AI orchestration, CV rules).
- Repositories: Prisma-backed data access only, no business rules.
- Business logic depends on **abstractions**, not concrete infrastructure (Dependency Inversion) — this is the mechanism by which Credits stays decoupled from M-Pesa (see [module-boundaries.md](module-boundaries.md)).

Every API response follows the envelope in `prompts/13-api-contracts.md`:

```json
// success
{ "success": true, "data": {}, "meta": {} }
// error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "...", "details": {} } }
```

Base path is versioned: `/api/v1`.

## 4. Domain Events

An MVP needs cross-module reactions (History logging, Notifications, Analytics) without those consumers reaching into every producer's internals. The chosen mechanism is a **lightweight in-process event emitter**, not a distributed queue/broker — appropriate for a single NestJS backend at MVP scale.

**Mechanism:** NestJS's built-in `EventEmitter2` (`@nestjs/event-emitter`). Each domain event is a plain, typed class (e.g. `PaymentCompletedEvent { paymentId, userId, amount, packageId }`). Services emit events *after* their own transaction commits successfully — events are a side effect of a committed state change, never a substitute for it. Consumers (History, Notifications, Analytics) subscribe via `@OnEvent(...)` listeners and only ever *read* — they never mutate the emitting module's data.

**Initial event catalogue:**

| Event | Emitted by | Consumed by |
|---|---|---|
| `UserRegistered` | Auth | History, Notifications |
| `PaymentCompleted` | Payments | Credits (triggers `PURCHASE` allocation), History, Notifications |
| `CreditsPurchased` | Credits | History, Notifications, Analytics |
| `CreditsConsumed` | Credits | History, Analytics |
| `CreditsRefunded` | Credits | History, Notifications |
| `CVCreated` | CVs | History, Analytics |
| `CVImproved` | AI | History, Analytics |
| `TestCompleted` | Tests | History, Notifications, Analytics |
| `InterviewCompleted` | Interviews | History, Notifications, Analytics |

**Where domain events belong:** each producing module owns and exports its own event classes (e.g. `apps/api/src/modules/credits/events/credits-consumed.event.ts`); there is no shared "events" module owning other modules' event definitions, to avoid a central coupling point. History, Notifications, and Analytics are the only modules allowed to be pure listeners across module boundaries — this is the one exception to the "services only call their own dependencies" rule in [module-boundaries.md](module-boundaries.md), and it is intentional: it's what keeps Credits/Payments/AI from having to know History or Notifications exist at all.

**Important boundary:** `PaymentCompleted` → Credits allocation is implemented as an event *listener calling the Credits service's public, transactional method* — it is not a fire-and-forget notification. The listener still goes through the same atomic, idempotent `allocateCredits()` path any other caller would use. Domain events here are a decoupling mechanism for cross-cutting concerns (audit/notify/analyze), not a replacement for direct, transactional service calls where correctness matters (payments → credits).

## 5. Cross-Cutting Concerns

- **Internationalization**: primary market Mozambique, primary language Portuguese, primary currency MZN/MT — all product/business/UI copy and currency handling go through i18n and currency-abstraction layers from day one, per `prompts/09-product-vision.md` §12–13. No hardcoded PT strings or MZN-specific math in business logic.
- **Financial integrity**: credit and payment operations are atomic, idempotent, auditable, recoverable (`prompts/00-rules.md`, `prompts/10-business-rules.md` §21, `prompts/11-credit-system.md` §20). See [credit-architecture.md](credit-architecture.md) for the resolved failure/refund rule.
- **AI integrity**: AI may reword but never invent user qualifications/experience; all credit-consuming AI calls go through the backend credit system, never charged from the frontend. See [ai-architecture.md](ai-architecture.md).
- **Security**: OWASP Top 10, RBAC, MFA-extensible auth, rate limiting, Helmet, CORS, bcrypt, never log secrets/PII, never trust frontend-supplied prices/credits/roles/payment status. See [security-architecture.md](security-architecture.md).
- **Observability**: structured logs for login, payments, credit usage, AI requests, admin actions; error/perf/API/DB monitoring in production; `ai_requests` table provides per-request cost/usage auditing (see [database-overview.md](database-overview.md)).

## 6. Remaining Open Decisions

See the "Remaining Open Questions" section of the latest architecture assessment delivered in chat. All items raised in the prior pass (prompts-path, CV data model, test retake policy, AI request tracking, credit-failure rule, soft-delete scope, admin MFA, token storage, PII classification, payment abstraction, credit/payment separation, domain events, database entity list, credit package configuration, MVP boundary) are resolved as of this pass. Only implementation-level details remain, tracked per-module as Phase 0+ begins.
