import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Prisma } from '@prisma/client';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  type ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import { AppLogger } from '../common/logger/app-logger.service';
import { HistoryRepository } from './history.repository';

/**
 * The only listener for resume-engine domain events in Phase 2A —
 * read-only from the emitting modules' point of view (per
 * docs/architecture/module-boundaries.md, History/Notifications/Analytics
 * are the modules allowed to be pure cross-module listeners). Turns each
 * event into one append-only `history_events` row.
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
}
