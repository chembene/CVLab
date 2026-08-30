import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  type ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import {
  CREDITS_ADJUSTED_EVENT,
  CREDITS_CONSUMED_EVENT,
  CREDITS_PURCHASED_EVENT,
  CREDITS_REFUNDED_EVENT,
  CREDITS_REVERSED_EVENT,
  type CreditsAdjustedEvent,
  type CreditsConsumedEvent,
  type CreditsPurchasedEvent,
  type CreditsRefundedEvent,
  type CreditsReversedEvent,
} from '../credits/events/credit-events';
import { AppLogger } from '../common/logger/app-logger.service';
import { HistoryRepository } from './history.repository';

/**
 * The only listener for domain events across the platform — read-only from
 * the emitting modules' point of view (per
 * docs/architecture/module-boundaries.md, History/Notifications/Analytics
 * are the modules allowed to be pure cross-module listeners). Turns each
 * event into one append-only `history_events` row. Handles both the Resume
 * Engine's generic `ResumeEntityChangedEvent` (Phase 2A+) and Credits' own
 * dedicated event classes (Phase 5) — see credit-events.ts for why Credits
 * doesn't reuse the generic event.
 */
@Injectable()
export class HistoryListener {
  private readonly logger = new AppLogger(HistoryListener.name);

  constructor(private readonly historyRepository: HistoryRepository) {}

  @OnEvent(RESUME_ENTITY_CHANGED_EVENT)
  async handleResumeEntityChanged(event: ResumeEntityChangedEvent): Promise<void> {
    await this.historyRepository.record({
      userId: event.userId,
      eventType: `${event.entityType}_${event.action}`,
      entityRef: event.entityId,
      metadata: event.metadata as Prisma.InputJsonValue | undefined,
    });
    this.logger.log({
      event: 'history_event_recorded',
      entityType: event.entityType,
      action: event.action,
    });
  }

  @OnEvent(CREDITS_CONSUMED_EVENT)
  async handleCreditsConsumed(event: CreditsConsumedEvent): Promise<void> {
    await this.record(event.userId, 'credits_consumed', event.transactionId, {
      amount: event.amount,
      reference: event.reference,
    });
  }

  @OnEvent(CREDITS_REFUNDED_EVENT)
  async handleCreditsRefunded(event: CreditsRefundedEvent): Promise<void> {
    await this.record(event.userId, 'credits_refunded', event.transactionId, {
      amount: event.amount,
      originalTransactionId: event.originalTransactionId,
    });
  }

  @OnEvent(CREDITS_PURCHASED_EVENT)
  async handleCreditsPurchased(event: CreditsPurchasedEvent): Promise<void> {
    await this.record(event.userId, 'credits_purchased', event.transactionId, {
      amount: event.amount,
      packageId: event.packageId,
    });
  }

  @OnEvent(CREDITS_ADJUSTED_EVENT)
  async handleCreditsAdjusted(event: CreditsAdjustedEvent): Promise<void> {
    await this.record(event.userId, 'credits_adjusted', event.transactionId, {
      amount: event.amount,
      adminId: event.adminId,
      reason: event.reason,
    });
  }

  @OnEvent(CREDITS_REVERSED_EVENT)
  async handleCreditsReversed(event: CreditsReversedEvent): Promise<void> {
    await this.record(event.userId, 'credits_reversed', event.transactionId, {
      amount: event.amount,
      originalTransactionId: event.originalTransactionId,
    });
  }

  private async record(
    userId: string,
    eventType: string,
    entityRef: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.historyRepository.record({
      userId,
      eventType,
      entityRef,
      metadata: metadata as Prisma.InputJsonValue,
    });
    this.logger.log({ event: 'history_event_recorded', eventType });
  }
}
