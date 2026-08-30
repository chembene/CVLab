import { HistoryListener } from './history.listener';
import type { HistoryRepository } from './history.repository';
import { ResumeEntityChangedEvent } from '../common/events/resume-entity-changed.event';
import {
  CreditsAdjustedEvent,
  CreditsConsumedEvent,
  CreditsPurchasedEvent,
  CreditsRefundedEvent,
  CreditsReversedEvent,
} from '../credits/events/credit-events';

describe('HistoryListener', () => {
  let repository: jest.Mocked<HistoryRepository>;
  let listener: HistoryListener;

  beforeEach(() => {
    repository = { record: jest.fn() } as unknown as jest.Mocked<HistoryRepository>;
    listener = new HistoryListener(repository);
  });

  it('records a history event combining entityType and action into eventType', async () => {
    const event = new ResumeEntityChangedEvent('user-1', 'work_experience', 'we-1', 'created', {
      company: 'Acme',
    });

    await listener.handleResumeEntityChanged(event);

    expect(repository.record).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'work_experience_created',
      entityRef: 'we-1',
      metadata: { company: 'Acme' },
    });
  });

  it('records credits_consumed', async () => {
    await listener.handleCreditsConsumed(
      new CreditsConsumedEvent('user-1', 'tx-1', 30, 'cv_improvement'),
    );

    expect(repository.record).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'credits_consumed',
      entityRef: 'tx-1',
      metadata: { amount: 30, reference: 'cv_improvement' },
    });
  });

  it('records credits_refunded', async () => {
    await listener.handleCreditsRefunded(new CreditsRefundedEvent('user-1', 'tx-2', 30, 'tx-1'));

    expect(repository.record).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'credits_refunded',
      entityRef: 'tx-2',
      metadata: { amount: 30, originalTransactionId: 'tx-1' },
    });
  });

  it('records credits_purchased', async () => {
    await listener.handleCreditsPurchased(
      new CreditsPurchasedEvent('user-1', 'tx-3', 200, 'pkg-1'),
    );

    expect(repository.record).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'credits_purchased',
      entityRef: 'tx-3',
      metadata: { amount: 200, packageId: 'pkg-1' },
    });
  });

  it('records credits_adjusted', async () => {
    await listener.handleCreditsAdjusted(
      new CreditsAdjustedEvent('user-1', 'tx-4', -10, 'admin-1', 'correction'),
    );

    expect(repository.record).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'credits_adjusted',
      entityRef: 'tx-4',
      metadata: { amount: -10, adminId: 'admin-1', reason: 'correction' },
    });
  });

  it('records credits_reversed', async () => {
    await listener.handleCreditsReversed(new CreditsReversedEvent('user-1', 'tx-5', 200, 'tx-3'));

    expect(repository.record).toHaveBeenCalledWith({
      userId: 'user-1',
      eventType: 'credits_reversed',
      entityRef: 'tx-5',
      metadata: { amount: 200, originalTransactionId: 'tx-3' },
    });
  });
});
