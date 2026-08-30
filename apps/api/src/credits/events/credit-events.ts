/**
 * Credits owns its own typed domain events — the ORIGINAL pattern from
 * docs/architecture/system-architecture.md §4 ("each producing module owns
 * and exports its own event classes"), not the generic
 * `ResumeEntityChangedEvent` reused by the Resume Engine (that reuse was
 * documented there as a deliberate EXCEPTION for ~13 structurally-identical
 * "owned resume-adjacent entity changed" services — a credit transaction is
 * a different kind of domain fact entirely). Consumed by HistoryListener;
 * see history.listener.ts.
 */

export const CREDITS_CONSUMED_EVENT = 'credits.consumed';
export const CREDITS_REFUNDED_EVENT = 'credits.refunded';
export const CREDITS_PURCHASED_EVENT = 'credits.purchased';
export const CREDITS_ADJUSTED_EVENT = 'credits.adjusted';
export const CREDITS_REVERSED_EVENT = 'credits.reversed';

export class CreditsConsumedEvent {
  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly amount: number,
    public readonly reference?: string,
  ) {}
}

export class CreditsRefundedEvent {
  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly amount: number,
    public readonly originalTransactionId: string,
  ) {}
}

export class CreditsPurchasedEvent {
  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly amount: number,
    public readonly packageId?: string,
  ) {}
}

export class CreditsAdjustedEvent {
  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly amount: number,
    public readonly adminId: string,
    public readonly reason: string,
  ) {}
}

export class CreditsReversedEvent {
  constructor(
    public readonly userId: string,
    public readonly transactionId: string,
    public readonly amount: number,
    public readonly originalTransactionId: string,
  ) {}
}
