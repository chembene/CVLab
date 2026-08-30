import { Injectable } from '@nestjs/common';
import type { AuditLog, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAuditLogData {
  action: string;
  targetType?: string;
  targetId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
}

/** Only Prisma access for the append-only `audit_logs` table lives here — per prompts/10-business-rules.md §17, every admin action touching Credits must produce one. */
@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(actorId: string, data: CreateAuditLogData): Promise<AuditLog> {
    return this.prisma.auditLog.create({ data: { actorId, ...data } });
  }
}
