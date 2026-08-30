import { Injectable, NotFoundException } from '@nestjs/common';
import type { AiRequest } from '@prisma/client';
import {
  AiRequestTrackingRepository,
  type CreateAiRequestData,
} from './ai-request-tracking.repository';

/**
 * Metadata side-channel for the AI Orchestration Engine (Phase 6) — no
 * controller, no HTTP surface, no AI call anywhere in this module itself.
 * `AiOrchestrationService` calls `start()` right before invoking a provider,
 * then `complete()` or `fail()` with the outcome, and `recordRefund()` after
 * an automatic credit refund. Idempotent: `start()` with an already-used
 * idempotencyKey returns the existing row instead of creating a duplicate
 * (matching CreditService's own idempotency pattern).
 */
@Injectable()
export class AiRequestTrackingService {
  constructor(private readonly repository: AiRequestTrackingRepository) {}

  async start(userId: string, data: CreateAiRequestData): Promise<AiRequest> {
    const existing = await this.repository.findByIdempotencyKey(data.idempotencyKey);
    if (existing) {
      return existing;
    }
    return this.repository.create(userId, data);
  }

  async complete(
    id: string,
    result: {
      requestId?: string;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      estimatedCost?: number;
      creditsCharged?: number;
      durationMs?: number;
    },
  ): Promise<AiRequest> {
    await this.assertExists(id);
    return this.repository.update(id, { ...result, status: 'SUCCEEDED', completedAt: new Date() });
  }

  async fail(
    id: string,
    result: { errorCode?: string; durationMs?: number; creditsCharged?: number },
  ): Promise<AiRequest> {
    await this.assertExists(id);
    return this.repository.update(id, { ...result, status: 'FAILED', completedAt: new Date() });
  }

  /** Called by RefundService after it refunds the credit_transaction associated with this AI request. */
  async recordRefund(id: string, creditsRefunded: number): Promise<AiRequest> {
    const request = await this.assertExists(id);
    return this.repository.update(id, {
      creditsRefunded: request.creditsRefunded + creditsRefunded,
    });
  }

  private async assertExists(id: string): Promise<AiRequest> {
    const request = await this.repository.findById(id);
    if (!request) {
      throw new NotFoundException('AI request not found.');
    }
    return request;
  }
}
