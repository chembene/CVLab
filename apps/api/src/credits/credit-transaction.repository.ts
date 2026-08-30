import { Injectable } from '@nestjs/common';
import type { CreditTransaction, CreditTransactionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateCreditTransactionData {
  amount: number;
  type: CreditTransactionType;
  balanceBefore: number;
  balanceAfter: number;
  reference?: string;
  description?: string;
  actor?: string;
  metadata?: Prisma.InputJsonValue;
  idempotencyKey: string;
}

/** Only Prisma access for the append-only `credit_transactions` ledger lives here. No `update()`/`delete()` — the ledger is never mutated once written. */
@Injectable()
export class CreditTransactionRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByIdempotencyKey(idempotencyKey: string): Promise<CreditTransaction | null> {
    return this.prisma.creditTransaction.findUnique({ where: { idempotencyKey } });
  }

  findById(id: string): Promise<CreditTransaction | null> {
    return this.prisma.creditTransaction.findUnique({ where: { id } });
  }

  /** Used to check "has this original transaction already been refunded/reversed" independent of the caller's idempotency key — a second, defense-in-depth guard against double-refunding. */
  findByReferenceAndType(
    reference: string,
    type: CreditTransactionType,
  ): Promise<CreditTransaction | null> {
    return this.prisma.creditTransaction.findFirst({ where: { reference, type } });
  }

  /** Must run inside the same transaction as the wallet mutation it accompanies — see CreditService/WalletRepository. */
  create(
    tx: Prisma.TransactionClient,
    userId: string,
    data: CreateCreditTransactionData,
  ): Promise<CreditTransaction> {
    return tx.creditTransaction.create({ data: { userId, ...data } });
  }

  async findAllByUserId(
    userId: string,
    { page, limit }: { page: number; limit: number },
  ): Promise<{ items: CreditTransaction[]; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.creditTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.creditTransaction.count({ where: { userId } }),
    ]);
    return { items, total };
  }
}
