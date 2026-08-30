import { Injectable } from '@nestjs/common';
import type { AiRequest, AiRequestStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateAiRequestData {
  feature: string;
  provider?: string;
  model?: string;
  promptHash?: string;
  promptVersion?: number;
  metadata?: Prisma.InputJsonValue;
  idempotencyKey: string;
}

export interface UpdateAiRequestData {
  status?: AiRequestStatus;
  requestId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  creditsCharged?: number;
  creditsRefunded?: number;
  durationMs?: number;
  errorCode?: string;
  completedAt?: Date;
}

/** Only Prisma access for the `ai_requests` table lives here. */
@Injectable()
export class AiRequestTrackingRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: CreateAiRequestData): Promise<AiRequest> {
    return this.prisma.aiRequest.create({ data: { userId, ...data } });
  }

  findById(id: string): Promise<AiRequest | null> {
    return this.prisma.aiRequest.findUnique({ where: { id } });
  }

  findByIdempotencyKey(idempotencyKey: string): Promise<AiRequest | null> {
    return this.prisma.aiRequest.findUnique({ where: { idempotencyKey } });
  }

  update(id: string, data: UpdateAiRequestData): Promise<AiRequest> {
    return this.prisma.aiRequest.update({ where: { id }, data });
  }
}
