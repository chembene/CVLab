import { HistoryListener } from './history.listener';
import type { HistoryRepository } from './history.repository';
import { ResumeEntityChangedEvent } from '../common/events/resume-entity-changed.event';

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
});
