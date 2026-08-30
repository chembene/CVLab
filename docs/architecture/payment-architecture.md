# CVLab AI — Payment Architecture

Status: resolved decision (approved 2026-07-30) — **abstraction and architecture only. No real M-Pesa API calls, endpoints, payloads, or credentials are defined here or anywhere in this repository.** Per `prompts/00-rules.md` "Do Not Guess" and `prompts/12-mpesa-integration.md` §2, the actual integration must be implemented against the [official M-Pesa developer portal](https://developer.mpesa.vm.co.mz/) at Phase 4 implementation time, not invented now.

**Phase 5 update (2026-08-02):** the provider abstraction described in §1 below has been implemented, ahead of the rest of this document's Payments flow, under the name `BillingProvider` (not `PaymentProvider` — renamed during implementation to avoid a name collision with the `Payment` Prisma model/future `PaymentsModule`). See `apps/api/src/billing/billing-provider.interface.ts` and [module-boundaries.md](module-boundaries.md)'s Billing row. Only the interface + a placeholder `MpesaBillingProvider` (every method throws `NotImplementedException`, zero external calls) exist — no payment intents, no callback handling, no real M-Pesa integration.

**Payments & Credits phase update (2026-08-26): the rest of this document (§2 onward) is now implemented — `PaymentsModule` exists and calls `CreditService.allocateFromPurchase()` for real.** `MpesaBillingProvider` is **still** the exact same `NotImplementedException` placeholder from Phase 5 — no M-Pesa credentials, endpoints, or payload shapes exist anywhere in this repo, per `prompts/00-rules.md` "Do Not Guess", unchanged. This phase built the entire flow _around_ that still-unimplemented provider boundary: `POST /payments` genuinely creates a `Payment` row and genuinely calls `provider.createPayment()`, which genuinely throws today — the created `Payment` is marked `FAILED` with the reason recorded, and the request surfaces a real `501 Not Implemented` to the caller. This is the disclosed, honest state of the system until a future phase consults the official M-Pesa developer portal and replaces the provider's method bodies — nothing here pretends to work. See [module-boundaries.md](module-boundaries.md)'s Payments row and `docs/development/roadmap.md`'s "Phase Payments & Credits" entry for the full implementation report.

**Provider selection is now a registry, not a single DI token** (Decision 1) — `BillingProviderRegistry` (`apps/api/src/billing/billing-provider.registry.ts`) mirrors `ai-orchestration/providers/provider-registry.ts`'s `ProviderRegistry` exactly: providers register themselves by their own `.provider` key (a `PaymentProviderName`) on module boot, and `PaymentService` resolves whichever one a `Payment.provider` field names, never importing a concrete provider class. Only `MPESA` is registered today (Decision 5) — adding e-Mola later means writing `EmolaBillingProvider` and one more `.register()` call in `BillingModule`, never touching `PaymentService`/`CreditService`. No placeholder `EmolaBillingProvider` exists yet, deliberately — the registry itself is what carries the multi-provider readiness, not a second unused class. The old single-token `BILLING_PROVIDER` DI symbol has been removed (nothing outside `BillingModule` ever depended on it).

## 1. Provider Abstraction

The business layer (Payments service, not yet implemented) will depend on a `BillingProvider` interface, never on a concrete provider — implemented, Phase 5, as:

```
interface BillingProvider {
  createPayment(input): Promise<ProviderPaymentHandle>
  checkPaymentStatus(reference): Promise<ProviderStatusResult>
  processCallback(rawPayload): Promise<ProviderCallbackResult>
  cancelPayment(reference): Promise<void>
  reversePayment(reference): Promise<void>
}
```

(Method signatures above match the real, implemented interface's shape; the method _bodies_ are still illustrative for a future provider — `MpesaBillingProvider`'s bodies all just throw `NotImplementedException` today.)

- `MpesaBillingProvider implements BillingProvider` — the first and only concrete implementation, still a placeholder.
- `EmolaProvider`, `CardProvider` — **not implemented**, but the interface + registry are designed so adding them later means writing a new class, not touching the Payments service or Credits at all (`prompts/09-product-vision.md` §7, `prompts/12-mpesa-integration.md` §1).
- `PaymentService` resolves a `BillingProvider` from `BillingProviderRegistry.get(payment.provider)` at the two points it needs one (`create()`, `verify()`) and never imports `MpesaBillingProvider` directly outside of `BillingModule`'s own provider-registration wiring.

## 2. Payment Flow (implemented, Payments & Credits phase — matches `prompts/12-mpesa-integration.md` §3)

```
User selects package
  → PaymentService.create() creates a Payment row (status PENDING), amount/currency derived server-side from CreditPackage — never from client input
  → PaymentService calls the resolved BillingProvider.createPayment()
    → today: MpesaBillingProvider throws NotImplementedException — Payment marked FAILED (reason recorded), error rethrown (501 to the caller)
    → once a real provider exists: (redirect/prompt/whatever the provider's flow requires), Payment marked PROCESSING with the provider's own reference
  → Provider confirms — either a webhook (POST /payments/callback/:provider) or a manual poll (POST /payments/:id/verify) — both paths converge on the exact same confirmPayment() logic, never duplicated
  → provider.processCallback()/checkPaymentStatus() normalizes the provider's raw response (never trusts the payload alone — see §4)
  → confirmPayment(): idempotent no-op if already COMPLETED; EXPIRED if the payment's expiresAt has passed; otherwise CreditService.allocateFromPurchase() runs (Payments never computes credit amounts itself) BEFORE the Payment row is marked COMPLETED — see the ordering note below
  → GET /credits and GET /credits/transactions already reflect the new PURCHASE/BONUS rows and updated wallet — no separate "notify" step was needed
```

**Ordering, not a single DB transaction, is what makes this safe.** `prompts/12-mpesa-integration.md` §12 asks for "Payment COMPLETED + credit transaction + wallet update" to happen atomically. `CreditService`'s methods each own their own `prisma.$transaction()` and don't accept an externally-supplied transaction client — extending that was out of scope ("não refatorar módulos existentes sem necessidade"), so `PaymentService.confirmPayment()` instead calls the already-idempotent `allocateFromPurchase()` (keyed `payment:{id}`) **before** flipping `Payment.status` to `COMPLETED`. If the process crashes between those two writes, a retry (another callback, or `verify()`) finds the credits already allocated (idempotent — no double credit) and simply completes the `Payment` update. The reverse — a `Payment` marked `COMPLETED` with no credits ever granted — cannot happen, because the credit allocation always runs first.

## 3. Normalized Status States

Internal states only — raw provider states are translated at the `MpesaProvider` boundary and never leak into business logic (`prompts/12-mpesa-integration.md` §5):

`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REVERSED`, `REFUNDED`.

## 4. Idempotency & Verification (non-negotiable, restated)

- Uniqueness constraint on `(provider, provider_reference)` at the database level — the same provider transaction can never produce two `payments` rows or two credit allocations.
- Credits are never granted from a frontend response, browser redirect, or user claim — only from a backend-verified provider status (`prompts/12-mpesa-integration.md` §10).
- Callback/webhook endpoints are dedicated, secured routes, separate from user-facing API routes, and process duplicates safely (§11, §13).
- Payment amount always comes from the backend's own `credit_packages` lookup, never from the client (§7).

## 5. What Is Explicitly Deferred to Phase 4 Implementation

- Exact M-Pesa endpoint URLs, request/response payload shapes, auth/header mechanism, callback payload format — must be sourced from the official developer portal, not drafted here.
- Sandbox vs. production credential handling — env var names are placeholders only (see the architecture assessment's environment configuration section); no real values exist anywhere in this repo.
- Reversal support is conditional on what the configured M-Pesa product actually supports (`prompts/12-mpesa-integration.md` §17) — cannot be finalized without the official docs.

## 6. Security

- All provider secrets are server-side environment variables or a secret manager — never shipped to the frontend, never committed (enforced by `.gitignore`).
- Logging is restricted to safe fields (`payment_id`, `provider`, `amount`, `status`, `timestamp`, `transaction reference`) — never passwords, API secrets, tokens, or PINs (`prompts/12-mpesa-integration.md` §19).

## 7. Provider Independence (restated from module-boundaries.md)

Credits has no knowledge of which provider funded a purchase. Only Payments and its `BillingProvider` implementations know that. This is enforced structurally, not just by convention: `CreditService.allocateFromPurchase()` (implemented, Phase 5) takes a `paymentId`/`packageId`, never a provider name or provider-specific payload.

## 8. Payment Expiration (implemented, Payments & Credits phase, Decision 2)

`Payment.expiresAt` (nullable `DateTime`) is set explicitly at creation time (`PAYMENT_EXPIRATION_MINUTES` env var, default 30) — never derived implicitly from `createdAt` alone, so it stays a real, auditable, queryable fact about the row per `prompts/12-mpesa-integration.md` §16. There is deliberately no background job/cron sweeping for expired payments (no new dependency added) — expiration is applied **lazily, on access**: `PaymentService.getOne()`/`list()` transition a stale `PENDING` payment to `EXPIRED` the moment anyone reads it, and `confirmPayment()` independently re-checks expiry before ever allocating credits, so a webhook arriving for an already-expired payment can never grant credits regardless of whether anything had read (and thus flipped) that row yet.

## 9. Credit Packages Endpoint (implemented, Payments & Credits phase, Decision 3)

`GET /credit-packages` — authenticated, self-service, top-level (deliberately not nested under `/credits`). Read-only catalog of `active` `CreditPackage` rows, same shared-catalog pattern as `/templates/resume`. `apps/api/src/credits/credit-package.repository.ts`/`credit-package.controller.ts` — lives in `CreditsModule` (package pricing is credits-domain configuration, same as `feature_pricing`), and `CreditPackageRepository` is exported for `PaymentsModule` to reuse at both payment-creation and payment-confirmation time, never duplicated.

## 10. What This Phase Deliberately Did Not Test Over Real HTTP

`MpesaBillingProvider` throwing `NotImplementedException` for every method means the full "webhook confirms → credits allocated" happy path cannot be exercised through a real HTTP request in this environment — doing so would require either an actual M-Pesa sandbox call (forbidden this phase) or a fake "always succeeds" provider standing in for a real one in production code, which was deliberately not introduced (a payment feature is exactly where a misleading always-succeeds stand-in would be dangerous, unlike e.g. `DummyAIProvider`'s safe-to-fake text generation). `confirmPayment()`'s actual credit-allocation logic — idempotency, expiration, status mapping, the ordering guarantee in §2 — is instead unit-tested directly with a mocked `BillingProviderRegistry` (`payment.service.spec.ts`). Everything reachable without a working provider (package listing, payment creation and its FAILED-on-error lifecycle, ownership/IDOR on every route, the callback route's lack of an auth requirement, `verify()`'s pre-provider validation) is covered by real e2e tests against real Postgres (`test/payments.e2e-spec.ts`).
