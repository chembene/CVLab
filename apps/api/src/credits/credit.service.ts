import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CreditTransaction, CreditTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletRepository } from './wallet.repository';
import { CreditTransactionRepository } from './credit-transaction.repository';
import { FeaturePricingRepository } from './feature-pricing.repository';
import { AuditLogRepository } from './audit-log.repository';
import { RefundService } from './refund.service';
import { InsufficientCreditsException } from './errors/insufficient-credits.exception';
import { isUniqueConstraintViolation } from './prisma-error.util';
import {
  CREDITS_ADJUSTED_EVENT,
  CREDITS_CONSUMED_EVENT,
  CREDITS_PURCHASED_EVENT,
  CREDITS_REVERSED_EVENT,
  CreditsAdjustedEvent,
  CreditsConsumedEvent,
  CreditsPurchasedEvent,
  CreditsReversedEvent,
} from './events/credit-events';

export interface SpendInput {
  amount: number;
  reference?: string;
  description?: string;
  idempotencyKey: string;
  metadata?: Prisma.InputJsonValue;
}

export interface AllocateFromPurchaseInput {
  packageId: string;
  totalCredits: number;
  bonusCredits: number;
  paymentId: string;
  idempotencyKey: string;
}

export interface ReverseInput {
  originalTransactionId: string;
  reason: string;
  idempotencyKey: string;
}

export interface AdminAdjustInput {
  userId: string;
  amount: number;
  type: Extract<CreditTransactionType, 'ADMIN_ADJUSTMENT' | 'PROMOTION'>;
  reason: string;
  idempotencyKey: string;
}

/**
 * The sole authority over wallet balances and the transaction ledger, per
 * docs/architecture/credit-architecture.md §1 — every mutation here runs
 * inside one Prisma `$transaction`, combining the atomic conditional wallet
 * update (WalletRepository) with the append-only ledger insert
 * (CreditTransactionRepository), so the two can never drift out of sync.
 * This service opens the transaction boundary itself (rather than a single
 * repository owning it) because it is the one place coordinating two
 * repositories atomically — that is transaction orchestration, not business
 * logic bypassing the repository pattern; every actual read/write still
 * goes through a repository method.
 */
@Injectable()
export class CreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: CreditTransactionRepository,
    private readonly featurePricingRepository: FeaturePricingRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly refundService: RefundService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Idempotent, concurrency-safe credit consumption. Throws InsufficientCreditsException without writing any ledger row when the balance is too low. */
  async spend(userId: string, dto: SpendInput): Promise<CreditTransaction> {
    const existing = await this.transactionRepository.findByIdempotencyKey(dto.idempotencyKey);
    if (existing) {
      return existing;
    }

    await this.walletRepository.ensureWallet(userId);

    try {
      const transaction = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
        const spent = await this.walletRepository.trySpend(tx, userId, dto.amount);
        if (!spent) {
          throw new InsufficientCreditsException();
        }
        return this.transactionRepository.create(tx, userId, {
          amount: -dto.amount,
          type: 'CONSUMPTION',
          balanceBefore: wallet.availableCredits,
          balanceAfter: wallet.availableCredits - dto.amount,
          reference: dto.reference,
          description: dto.description,
          actor: userId,
          metadata: dto.metadata,
          idempotencyKey: dto.idempotencyKey,
        });
      });

      this.eventEmitter.emit(
        CREDITS_CONSUMED_EVENT,
        new CreditsConsumedEvent(userId, transaction.id, dto.amount, dto.reference),
      );
      return transaction;
    } catch (error) {
      return this.recoverFromIdempotencyRace(error, dto.idempotencyKey);
    }
  }

  /**
   * RESERVE → PROCESS → COMMIT/RELEASE (credit-architecture.md §4), expressed
   * as spend-then-auto-refund-on-failure: charges the credits up front, runs
   * `work`, and — if `work` throws for any reason — automatically refunds
   * the charge before rethrowing. Future AI features (Phase 6+) wrap their
   * provider call in this instead of managing spend/refund bookkeeping
   * themselves.
   */
  async spendAndExecute<T>(userId: string, params: SpendInput, work: () => Promise<T>): Promise<T> {
    const transaction = await this.spend(userId, params);
    try {
      return await work();
    } catch (error) {
      await this.refundService.refund(userId, {
        originalTransactionId: transaction.id,
        reason: 'Automatic refund: the operation failed after credits were charged.',
        idempotencyKey: `refund:${params.idempotencyKey}`,
      });
      throw error;
    }
  }

  /** Not exposed via any endpoint yet — ready for a future Payments module to call once a payment is backend-verified as COMPLETED. Splits PURCHASE and BONUS into two ledger rows per credit-architecture.md §2. */
  async allocateFromPurchase(
    userId: string,
    dto: AllocateFromPurchaseInput,
  ): Promise<CreditTransaction[]> {
    const existing = await this.transactionRepository.findByIdempotencyKey(dto.idempotencyKey);
    if (existing) {
      return [existing];
    }

    await this.walletRepository.ensureWallet(userId);
    const baseCredits = dto.totalCredits - dto.bonusCredits;
    if (baseCredits < 0) {
      throw new BadRequestException('bonusCredits cannot exceed totalCredits.');
    }

    try {
      const transactions = await this.prisma.$transaction(async (tx) => {
        const results: CreditTransaction[] = [];

        if (baseCredits > 0) {
          const before = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
          const after = await this.walletRepository.credit(tx, userId, baseCredits, {
            countsAsPurchased: true,
          });
          results.push(
            await this.transactionRepository.create(tx, userId, {
              amount: baseCredits,
              type: 'PURCHASE',
              balanceBefore: before.availableCredits,
              balanceAfter: after.availableCredits,
              reference: dto.paymentId,
              description: 'Credit package purchase',
              actor: userId,
              idempotencyKey: dto.idempotencyKey,
            }),
          );
        }

        if (dto.bonusCredits > 0) {
          const before = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
          const after = await this.walletRepository.credit(tx, userId, dto.bonusCredits, {
            countsAsPurchased: true,
          });
          results.push(
            await this.transactionRepository.create(tx, userId, {
              amount: dto.bonusCredits,
              type: 'BONUS',
              balanceBefore: before.availableCredits,
              balanceAfter: after.availableCredits,
              reference: dto.paymentId,
              description: 'Bonus credits for this package',
              actor: userId,
              idempotencyKey: `${dto.idempotencyKey}:bonus`,
            }),
          );
        }

        return results;
      });

      for (const transaction of transactions) {
        this.eventEmitter.emit(
          CREDITS_PURCHASED_EVENT,
          new CreditsPurchasedEvent(userId, transaction.id, transaction.amount, dto.packageId),
        );
      }
      return transactions;
    } catch (error) {
      const recovered = await this.recoverFromIdempotencyRace(error, dto.idempotencyKey);
      return [recovered];
    }
  }

  /** Not exposed via any endpoint yet — ready for a future Payments module to call on a chargeback/dispute. Only PURCHASE/BONUS transactions can be reversed. */
  async reverse(userId: string, dto: ReverseInput): Promise<CreditTransaction> {
    const existing = await this.transactionRepository.findByIdempotencyKey(dto.idempotencyKey);
    if (existing) {
      return existing;
    }

    const original = await this.transactionRepository.findById(dto.originalTransactionId);
    if (!original || original.userId !== userId) {
      throw new NotFoundException('Original transaction not found.');
    }
    if (original.type !== 'PURCHASE' && original.type !== 'BONUS') {
      throw new BadRequestException('Only PURCHASE or BONUS transactions can be reversed.');
    }

    await this.walletRepository.ensureWallet(userId);

    try {
      const transaction = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId } });
        const applied = await this.walletRepository.tryDebit(tx, userId, original.amount);
        if (!applied) {
          throw new InsufficientCreditsException(
            'Cannot reverse — the credits have already been spent.',
          );
        }
        return this.transactionRepository.create(tx, userId, {
          amount: -original.amount,
          type: 'REVERSAL',
          balanceBefore: wallet.availableCredits,
          balanceAfter: wallet.availableCredits - original.amount,
          reference: original.id,
          description: dto.reason,
          actor: userId,
          idempotencyKey: dto.idempotencyKey,
        });
      });

      this.eventEmitter.emit(
        CREDITS_REVERSED_EVENT,
        new CreditsReversedEvent(userId, transaction.id, original.amount, original.id),
      );
      return transaction;
    } catch (error) {
      return this.recoverFromIdempotencyRace(error, dto.idempotencyKey);
    }
  }

  /** Admin-only (enforced by the controller's RolesGuard). Positive or negative; a negative adjustment is subject to the same negative-balance protection as spend(). Always audit-logged. */
  async adjustBalance(adminId: string, dto: AdminAdjustInput): Promise<CreditTransaction> {
    const existing = await this.transactionRepository.findByIdempotencyKey(dto.idempotencyKey);
    if (existing) {
      return existing;
    }
    if (dto.amount === 0) {
      throw new BadRequestException('Adjustment amount must not be zero.');
    }

    const before = await this.walletRepository.ensureWallet(dto.userId);

    try {
      const transaction = await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.creditWallet.findUniqueOrThrow({ where: { userId: dto.userId } });

        if (dto.amount < 0) {
          const applied = await this.walletRepository.tryDebit(
            tx,
            dto.userId,
            Math.abs(dto.amount),
          );
          if (!applied) {
            throw new InsufficientCreditsException(
              'Adjustment would result in a negative balance.',
            );
          }
        } else {
          await this.walletRepository.credit(tx, dto.userId, dto.amount);
        }

        return this.transactionRepository.create(tx, dto.userId, {
          amount: dto.amount,
          type: dto.type,
          balanceBefore: wallet.availableCredits,
          balanceAfter: wallet.availableCredits + dto.amount,
          description: dto.reason,
          actor: adminId,
          idempotencyKey: dto.idempotencyKey,
        });
      });

      await this.auditLogRepository.create(adminId, {
        action: 'credits.adjust',
        targetType: 'user',
        targetId: dto.userId,
        before: { availableCredits: before.availableCredits },
        after: { availableCredits: before.availableCredits + dto.amount },
        reason: dto.reason,
      });

      this.eventEmitter.emit(
        CREDITS_ADJUSTED_EVENT,
        new CreditsAdjustedEvent(dto.userId, transaction.id, dto.amount, adminId, dto.reason),
      );
      return transaction;
    } catch (error) {
      return this.recoverFromIdempotencyRace(error, dto.idempotencyKey);
    }
  }

  async listTransactions(
    userId: string,
    pagination: { page: number; limit: number },
  ): Promise<{
    items: CreditTransaction[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { items, total } = await this.transactionRepository.findAllByUserId(userId, pagination);
    return {
      items,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
    };
  }

  async estimate(
    userId: string,
    featureKey: string,
  ): Promise<{
    featureKey: string;
    cost: number;
    currentBalance: number;
    sufficientBalance: boolean;
    balanceAfter: number;
  }> {
    const pricing = await this.featurePricingRepository.findActiveByKey(featureKey);
    if (!pricing) {
      throw new NotFoundException('Unknown or inactive feature.');
    }
    const wallet = await this.walletRepository.ensureWallet(userId);

    return {
      featureKey,
      cost: pricing.cost,
      currentBalance: wallet.availableCredits,
      sufficientBalance: wallet.availableCredits >= pricing.cost,
      balanceAfter: wallet.availableCredits - pricing.cost,
    };
  }

  /**
   * Two concurrent requests carrying the same idempotency key can both pass
   * the pre-check and race into the transaction; only one insert wins, the
   * other hits the unique constraint. Rather than surfacing that as an
   * error, re-fetch and return what the winner wrote — true idempotency
   * under concurrency, not just under sequential retries.
   */
  private async recoverFromIdempotencyRace(
    error: unknown,
    idempotencyKey: string,
  ): Promise<CreditTransaction> {
    if (isUniqueConstraintViolation(error)) {
      const raceWinner = await this.transactionRepository.findByIdempotencyKey(idempotencyKey);
      if (raceWinner) {
        return raceWinner;
      }
    }
    throw error;
  }
}
