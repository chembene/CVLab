/**
 * Provider-agnostic payment abstraction, per
 * docs/architecture/payment-architecture.md §1 — the Payments module (a
 * future phase) will depend on this interface, never on a concrete
 * provider. `MpesaBillingProvider` is the first (placeholder) implementation
 * registered behind it; future providers (EMOLA, Stripe, PayPal, Visa,
 * Mastercard) become new classes implementing this same interface — no
 * business logic changes required to add one.
 *
 * Method signatures are illustrative, matching payment-architecture.md §1's
 * own wording — exact request/response shapes are defined at the phase that
 * actually integrates a real provider, against that provider's official
 * documentation (prompts/00-rules.md "Do Not Guess"), never invented here.
 */

import type { PaymentProviderName } from '@prisma/client';

export interface CreatePaymentInput {
  userId: string;
  packageId: string;
  amount: number;
  currency: string;
  /** Caller-supplied idempotency key — the provider implementation must not create two provider-side payments for the same key. */
  idempotencyKey: string;
}

export interface ProviderPaymentHandle {
  /** The provider's own identifier for this payment attempt (e.g. an M-Pesa transaction/conversation ID). */
  providerReference: string;
  /** Present when the provider's flow requires redirecting/prompting the user (e.g. a USSD push confirmation). */
  redirectUrl?: string;
  raw?: unknown;
}

/** Normalized status — never the provider's raw status string, per payment-architecture.md §3. */
export type NormalizedPaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REVERSED'
  | 'REFUNDED';

export interface ProviderStatusResult {
  status: NormalizedPaymentStatus;
  raw?: unknown;
}

export interface ProviderCallbackResult {
  providerReference: string;
  status: NormalizedPaymentStatus;
  raw?: unknown;
}

export interface BillingProvider {
  /** Registry key — matches `Payment.provider` (PaymentProviderName). Mirrors AIProvider.name in ai-orchestration/providers/provider-registry.ts, the exact pattern this registry follows (Payments & Credits phase, Decision 1). */
  readonly provider: PaymentProviderName;
  createPayment(input: CreatePaymentInput): Promise<ProviderPaymentHandle>;
  checkPaymentStatus(providerReference: string): Promise<ProviderStatusResult>;
  processCallback(rawPayload: unknown): Promise<ProviderCallbackResult>;
  cancelPayment(providerReference: string): Promise<void>;
  reversePayment(providerReference: string): Promise<void>;
}
