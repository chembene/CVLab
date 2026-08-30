import { CreditTransactionRepository } from './credit-transaction.repository';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

describe('CreditTransactionRepository', () => {
  function buildPrismaMock() {
    const creditTransaction = {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    };
    const prisma = { creditTransaction } as unknown as jest.Mocked<PrismaService>;
    const tx = { creditTransaction } as unknown as Prisma.TransactionClient;
    return { prisma, tx, creditTransaction };
  }

  it('findByIdempotencyKey() queries the unique idempotencyKey field', async () => {
    const { prisma, creditTransaction } = buildPrismaMock();
    const repository = new CreditTransactionRepository(prisma);

    await repository.findByIdempotencyKey('k1');

    expect(creditTransaction.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: 'k1' } });
  });

  it('findByReferenceAndType() filters by both reference and type', async () => {
    const { prisma, creditTransaction } = buildPrismaMock();
    const repository = new CreditTransactionRepository(prisma);

    await repository.findByReferenceAndType('tx-1', 'REFUND');

    expect(creditTransaction.findFirst).toHaveBeenCalledWith({
      where: { reference: 'tx-1', type: 'REFUND' },
    });
  });

  it('create() writes userId plus the provided ledger fields, via the transactional client', async () => {
    const { tx, creditTransaction } = buildPrismaMock();
    const repository = new CreditTransactionRepository({} as never);
    const data = {
      amount: -30,
      type: 'CONSUMPTION' as const,
      balanceBefore: 100,
      balanceAfter: 70,
      idempotencyKey: 'k1',
    };

    await repository.create(tx, 'user-1', data);

    expect(creditTransaction.create).toHaveBeenCalledWith({ data: { userId: 'user-1', ...data } });
  });

  it('findAllByUserId() paginates and returns items + total', async () => {
    const { prisma, creditTransaction } = buildPrismaMock();
    creditTransaction.findMany.mockResolvedValue([{ id: 'tx-1' }]);
    creditTransaction.count.mockResolvedValue(1);
    const repository = new CreditTransactionRepository(prisma);

    const result = await repository.findAllByUserId('user-1', { page: 2, limit: 10 });

    expect(creditTransaction.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(result).toEqual({ items: [{ id: 'tx-1' }], total: 1 });
  });
});
