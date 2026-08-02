import { Injectable } from '@nestjs/common';
import type { HistoryEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordHistoryEventData {
  userId: string;
  eventType: string;
  entityRef?: string;
  metadata?: Prisma.InputJsonValue;
}

/** Only Prisma access for the `history_events` table lives here. */
@Injectable()
export class HistoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(data: RecordHistoryEventData): Promise<HistoryEvent> {
    return this.prisma.historyEvent.create({ data });
  }
}
