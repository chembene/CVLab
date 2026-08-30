import { Injectable } from '@nestjs/common';
import type { CreditWallet, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Only Prisma access for the `credit_wallets` table lives here. */
@Injectable()
export class WalletRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<CreditWallet | null> {
    return this.prisma.creditWallet.findUnique({ where: { userId } });
  }

  /** Lazily creates a zero-balance wallet if one doesn't exist yet — cheap and idempotent, safe to call before every credit operation. Registration (Phase 1) never creates one, by design: this keeps Auth/Users untouched. */
  ensureWallet(userId: string): Promise<CreditWallet> {
    return this.prisma.creditWallet.upsert({ where: { userId }, create: { userId }, update: {} });
  }

  /**
   * Atomic conditional decrement — the balance check (`availableCredits gte
   * amount`) and the decrement happen as a single Postgres UPDATE statement.
   * This is the concurrency-safety mechanism: two concurrent spends racing
   * against the same wallet can never both succeed past the point where the
   * combined total would go negative, because Postgres serializes UPDATEs
   * against the same row. Equivalent protection to optimistic locking
   * (version column + retry-on-conflict), without needing either — a
   * disclosed, deliberate simplification. Must run inside the same
   * transaction as the ledger row it accompanies (see CreditService).
   * Returns false when the balance is insufficient; the caller must not
   * have written a ledger row yet at that point.
   */
  async trySpend(tx: Prisma.TransactionClient, userId: string, amount: number): Promise<boolean> {
    return this.conditionalDecrement(tx, userId, amount, {
      lifetimeConsumed: { increment: amount },
    });
  }

  /** Same atomic conditional decrement as `trySpend`, but for REVERSAL/negative-ADMIN_ADJUSTMENT — deliberately does not touch `lifetimeConsumed`, which tracks only genuine feature consumption. */
  async tryDebit(tx: Prisma.TransactionClient, userId: string, amount: number): Promise<boolean> {
    return this.conditionalDecrement(tx, userId, amount);
  }

  private async conditionalDecrement(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    extraData: Prisma.CreditWalletUpdateManyMutationInput = {},
  ): Promise<boolean> {
    const result = await tx.creditWallet.updateMany({
      where: { userId, availableCredits: { gte: amount } },
      data: { availableCredits: { decrement: amount }, ...extraData },
    });
    return result.count > 0;
  }

  /** Unconditional credit (purchase/bonus/refund/positive adjustment) — no negative-balance risk on the crediting side. `countsAsPurchased` only applies to real PURCHASE/BONUS grants, not refunds/adjustments (see CreditService for the full type-to-effect mapping). */
  credit(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: number,
    opts: { countsAsPurchased?: boolean } = {},
  ): Promise<CreditWallet> {
    return tx.creditWallet.update({
      where: { userId },
      data: {
        availableCredits: { increment: amount },
        ...(opts.countsAsPurchased ? { lifetimePurchased: { increment: amount } } : {}),
      },
    });
  }
}
