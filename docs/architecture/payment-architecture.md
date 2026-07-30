# CVLab AI — Payment Architecture

Status: resolved decision (approved 2026-07-30) — **abstraction and architecture only. No real M-Pesa API calls, endpoints, payloads, or credentials are defined here or anywhere in this repository.** Per `prompts/00-rules.md` "Do Not Guess" and `prompts/12-mpesa-integration.md` §2, the actual integration must be implemented against the [official M-Pesa developer portal](https://developer.mpesa.vm.co.mz/) at Phase 4 implementation time, not invented now.

## 1. Provider Abstraction

The business layer (Payments service) depends on a `PaymentProvider` interface, never on a concrete provider:

```
interface PaymentProvider {
  createPayment(input): Promise<ProviderPaymentHandle>
  checkPaymentStatus(reference): Promise<ProviderStatus>
  processCallback(rawPayload): Promise<ProviderCallbackResult>
  cancelPayment(reference): Promise<void>
  reversePayment(reference): Promise<void>
}
```

(Method signatures are illustrative — exact shapes are defined at implementation time against real provider documentation, per module.)

- `MpesaProvider implements PaymentProvider` — the first and only concrete implementation in MVP.
- `EmolaProvider`, `CardProvider` — **not implemented in MVP**, but the interface is designed so adding them later means writing a new class, not touching the Payments service or Credits at all (`prompts/09-product-vision.md` §7, `prompts/12-mpesa-integration.md` §1).
- The Payments service is injected with a `PaymentProvider` (via NestJS DI, provider selected by the payment's `provider` field), and never imports `MpesaProvider` directly outside of the module's own provider-registration wiring.

## 2. Payment Flow (conceptual, matches `prompts/12-mpesa-integration.md` §3)

```
User selects package
  → Payments creates a payment intent (status PENDING), amount/credits derived server-side from credit_packages — never from client input
  → Payments calls PaymentProvider.createPayment()
  → (redirect/prompt/whatever the provider's flow requires)
  → Provider confirms (callback and/or status poll)
  → Payments.processCallback() verifies the transaction against the provider (never trusts the callback payload alone)
  → Payment marked COMPLETED (idempotent by provider_reference — duplicate callbacks are no-ops)
  → Payments emits PaymentCompleted domain event
  → Credits.allocateFromPurchase() runs — Payments never computes credit amounts itself
  → User notified
```

Steps "payment marked COMPLETED" + "credit transaction created" + "wallet updated" happen atomically per `prompts/12-mpesa-integration.md` §12 — see [credit-architecture.md](credit-architecture.md) §2 for exactly where that boundary sits (Payments emits the event; Credits' own service method is transactional).

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

Credits has no knowledge of which provider funded a purchase. Only Payments and its `PaymentProvider` implementations know that. This is enforced structurally, not just by convention: `Credits.allocateFromPurchase()` takes a `paymentId`/`packageId`, never a provider name or provider-specific payload.
