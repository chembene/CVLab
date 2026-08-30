import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CreditTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletRepository } from './wallet.repository';
import { CreditTransactionRepository } from './credit-transaction.repository';
import { isUniqueConstraintViolation } from './prisma-error.util';
import { CREDITS_REFUNDED_EVENT, CreditsRefundedEvent } from './events/credit-events';

export interface RefundInput {
  originalTransactionId: string;
  reason: string;
  idempotencyKey: string;
}

/**
 * The only place a REFUND ledger row is ever written. Called directly for
 * admin/support-triggered refunds, and automatically by
 * `CreditService.spendAndExecute()` when the work it guards throws — that
 * automatic path is what satisfies "Automatic refund mechanism" without
 * needing any AI feature to exist yet to trigger it (Phase 6+ will).
 */
@Injectable()
export class RefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: CreditTransactionRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async refund(userId: string, dto: RefundInput): Promise<CreditTransaction> {
    const existing = await this.transactionRepository.findByIdempotencyKey(dto.idempotencyKey);
    if (existing) {
      return existing;
    }

    const original = await this.transactionRepository.findById(dto.originalTransactionId);
    if (!original || original.userId !== userId) {
      throw new NotFoundException('Original transaction not found.');
    }
    if (original.type !== 'CONSUMPTION') {
      throw new BadRequestException('Only CONSUMPTION transactions can be refunded.');
    }

    // Second, independent idempotency guard: even under a different
    // idempotency key, the same original consumption is never refunded
    // twice — "never grant credits twice" applies to refunds too.
    const alreadyRefunded = await this.transactionRepository.findByReferenceAndType(
      original.id,
      'REFUND',
    );
    if (alreadyRefunded) {
      return alreadyRefunded;
    }

    const refundAmount = Math.abs(original.amount);

    try {
      const transaction = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
        await this.walletRepository.credit(tx, userId, refundAmount);
        return this.transactionRepository.create(tx, userId, {
          amount: refundAmount,
          type: 'REFUND',
          balanceBefore: wallet.availableCredits,
          balanceAfter: wallet.availableCredits + refundAmount,
          reference: original.id,
          description: dto.reason,
          actor: userId,
          idempotencyKey: dto.idempotencyKey,
        });
      });

      this.eventEmitter.emit(
        CREDITS_REFUNDED_EVENT,
        new CreditsRefundedEvent(userId, transaction.id, refundAmount, original.id),
      );
      return transaction;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        const raceWinner = await this.transactionRepository.findByIdempotencyKey(
          dto.idempotencyKey,
        );
        if (raceWinner) return raceWinner;
      }
      throw error;
    }
  }
}
