# CVLab AI — Module Map & Domain Boundaries

## 1. Backend Modules & Responsibilities

| Module | Responsibility | Depends on |
|---|---|---|
| **Auth** | Registration, login, logout, JWT issue/refresh, password hashing (bcrypt), email verification & password reset flows, RBAC primitives | Users |
| **Users** | Account identity, uniqueness (email, phone), status (`ACTIVE`, `SUSPENDED`, `PENDING_VERIFICATION`, `DELETED`), roles | — |
| **Profiles** | Personal/professional info, education, skills, experience, social links, photo | Users |
| **CVs** | CV documents, sections, templates, autosave, preview, PDF export | Users, Profiles |
| **CV Versions** | Version history & recovery for CVs | CVs |
| **AI** | Orchestrates OpenAI calls for CV improvement, cover letters, ATS analysis, interview evaluation, career advice; owns prompt templates (stored separately, never hardcoded in business logic); tracks tokens/cost per user/feature | Credits (via abstraction), CVs |
| **Credits** | Wallet, ledger, transaction types, atomic deduction, reservation (RESERVE→PROCESS→COMMIT/RELEASE), idempotency keys, refunds, admin adjustments | Users only |
| **Payments** | Payment intents, provider abstraction (`PaymentProvider` interface), normalized status states, callback/webhook handling, reconciliation | Users, Credits (via events/interface, not the reverse) |
| **Tests** | Question bank, test definitions, test sessions, scoring, timers | Users, Credits |
| **Interviews** | Interview sessions, AI-generated questions, answers, evaluation, scores | Users, Credits, AI |
| **Notifications** | In-app notifications for payments, credits, test/interview results | Users |
| **History** | Centralized activity feed (login, CV actions, AI actions, tests, interviews, payments, credits) | reads from all modules (event-driven or query-driven, no writes back) |
| **Admin** | User/test/question/credit-package/AI-prompt/content management, payment visibility, platform stats, audit logs | all modules (read/administrative-write only, via service layer — never bypasses Credits/Payments invariants) |
| **Analytics** | Aggregated metrics: registrations, active users, CVs created, tests/interviews completed, revenue, conversion, retention | reads from all modules |

## 2. Domain Boundary Rules (non-negotiable)

### Credits must never depend on Payments
`Credits` exposes operations like `reserveCredits()`, `consumeCredits()`, `refundCredits()`, `adjustCredits()` that operate purely on user ID + amount + reason + idempotency key. It has **zero knowledge** of M-Pesa, eMola, or any provider. Per `prompts/12-mpesa-integration.md` §23 ("Provider Independence"): *"The credit system must not know whether payment came from M-Pesa, eMola, Card, Bank. Only the payment subsystem knows the provider."*

### Payments must depend on a provider abstraction, not on M-Pesa directly
`Payments` defines a `PaymentProvider` interface (`createPayment`, `checkPaymentStatus`, `processCallback`, `cancelPayment`, `reversePayment`). `MpesaProvider` is one implementation registered behind it (Dependency Inversion, per `prompts/00-rules.md` "Architecture Principles"). `Payments` is the **only** module that calls `Credits` to grant credits, and only after backend-verified confirmation — never from a webhook payload alone without verification, never twice for the same provider transaction (idempotent by provider reference).

### AI must never bypass Credits
Every credit-consuming AI operation flows: `AI service` → checks/reserves cost via `Credits` → calls OpenAI → commits or releases the reservation based on outcome. `AI` never mutates wallet/ledger state directly; it only calls `Credits`' public interface.

### Users is the root aggregate, nothing depends "upward" into feature modules
`Users` has no knowledge of CVs, Credits, Payments, etc. Profiles/CVs/Credits/Payments all reference `userId` but the dependency arrow points one way (feature modules → Users), never back.

### CVs never touches billing directly
`CVs` triggers paid operations (improve, translate, analyse) by calling `AI`, which in turn calls `Credits`. `CVs` never calls `Credits` directly and never hardcodes credit costs (costs are configuration owned by `Credits`/Admin, per `prompts/11-credit-system.md` §4).

### Admin is a privileged read/orchestration layer, not a bypass
Admin actions that touch Credits (manual adjustment) or Payments (refund approval) must still go through the same audited, ledger-writing service methods as normal flows — never direct DB writes. Every admin action affecting credits/payments/users/permissions/AI config produces an audit log entry (`prompts/10-business-rules.md` §17).

## 3. Dependency Diagram (conceptual)

```
Users ← Profiles, CVs, Credits, Payments, Tests, Interviews, Notifications, History, Admin, Analytics

CVs → AI → Credits
CVs → CV Versions
Interviews → AI → Credits
Tests → Credits
Payments → Credits            (one-directional: Payments calls Credits, never reverse)
Payments → PaymentProvider ← MpesaProvider (impl)
Admin → (service layer of) every module — never direct repository access
History ← (reads from) every module
Analytics ← (reads from) every module
```
