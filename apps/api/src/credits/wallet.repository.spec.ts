import { WalletRepository } from './wallet.repository';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

describe('WalletRepository', () => {
  function buildPrismaMock() {
    const creditWallet = {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    };
    const prisma = { creditWallet } as unknown as jest.Mocked<PrismaService>;
    const tx = { creditWallet } as unknown as Prisma.TransactionClient;
    return { prisma, tx, creditWallet };
  }

  it('ensureWallet() upserts with zero defaults', async () => {
    const { prisma, creditWallet } = buildPrismaMock();
    const repository = new WalletRepository(prisma);

    await repository.ensureWallet('user-1');

    expect(creditWallet.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1' },
      update: {},
    });
  });

  describe('trySpend', () => {
    it('performs one atomic conditional UPDATE and increments lifetimeConsumed', async () => {
      const { tx, creditWallet } = buildPrismaMock();
      creditWallet.updateMany.mockResolvedValue({ count: 1 });
      const repository = new WalletRepository({} as never);

      const result = await repository.trySpend(tx, 'user-1', 30);

      expect(result).toBe(true);
      expect(creditWallet.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', availableCredits: { gte: 30 } },
        data: { availableCredits: { decrement: 30 }, lifetimeConsumed: { increment: 30 } },
      });
    });

    it('returns false when the conditional UPDATE affects 0 rows (insufficient balance)', async () => {
      const { tx, creditWallet } = buildPrismaMock();
      creditWallet.updateMany.mockResolvedValue({ count: 0 });
      const repository = new WalletRepository({} as never);

      const result = await repository.trySpend(tx, 'user-1', 1000);

      expect(result).toBe(false);
    });
  });

  describe('tryDebit', () => {
    it('performs the same atomic conditional UPDATE but does not touch lifetimeConsumed', async () => {
      const { tx, creditWallet } = buildPrismaMock();
      creditWallet.updateMany.mockResolvedValue({ count: 1 });
      const repository = new WalletRepository({} as never);

      await repository.tryDebit(tx, 'user-1', 50);

      expect(creditWallet.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', availableCredits: { gte: 50 } },
        data: { availableCredits: { decrement: 50 } },
      });
    });
  });

  describe('credit', () => {
    it('increments availableCredits only, by default', async () => {
      const { tx, creditWallet } = buildPrismaMock();
      const repository = new WalletRepository({} as never);

      await repository.credit(tx, 'user-1', 200);

      expect(creditWallet.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { availableCredits: { increment: 200 } },
      });
    });

    it('also increments lifetimePurchased when countsAsPurchased is true', async () => {
      const { tx, creditWallet } = buildPrismaMock();
      const repository = new WalletRepository({} as never);

      await repository.credit(tx, 'user-1', 200, { countsAsPurchased: true });

      expect(creditWallet.update).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { availableCredits: { increment: 200 }, lifetimePurchased: { increment: 200 } },
      });
    });
  });
});
