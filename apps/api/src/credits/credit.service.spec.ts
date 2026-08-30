import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CreditService } from './credit.service';
import { InsufficientCreditsException } from './errors/insufficient-credits.exception';
import type { WalletRepository } from './wallet.repository';
import type { CreditTransactionRepository } from './credit-transaction.repository';
import type { FeaturePricingRepository } from './feature-pricing.repository';
import type { AuditLogRepository } from './audit-log.repository';
import type { RefundService } from './refund.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('CreditService', () => {
  let prisma: { $transaction: jest.Mock };
  let walletRepository: jest.Mocked<WalletRepository>;
  let transactionRepository: jest.Mocked<CreditTransactionRepository>;
  let featurePricingRepository: jest.Mocked<FeaturePricingRepository>;
  let auditLogRepository: jest.Mocked<AuditLogRepository>;
  let refundService: jest.Mocked<RefundService>;
  let eventEmitter: { emit: jest.Mock };
  let service: CreditService;
  let tx: { creditWallet: { findUniqueOrThrow: jest.Mock } };

  beforeEach(() => {
    tx = {
      creditWallet: { findUniqueOrThrow: jest.fn().mockResolvedValue({ availableCredits: 100 }) },
    };
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)) };
    walletRepository = {
      ensureWallet: jest.fn().mockResolvedValue({ userId: 'user-1', availableCredits: 100 }),
      trySpend: jest.fn().mockResolvedValue(true),
      tryDebit: jest.fn().mockResolvedValue(true),
      credit: jest.fn().mockResolvedValue({ availableCredits: 100 }),
    } as unknown as jest.Mocked<WalletRepository>;
    transactionRepository = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      findByReferenceAndType: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'tx-new' }),
      findAllByUserId: jest.fn(),
    } as unknown as jest.Mocked<CreditTransactionRepository>;
    featurePricingRepository = {
      findActiveByKey: jest.fn(),
    } as unknown as jest.Mocked<FeaturePricingRepository>;
    auditLogRepository = { create: jest.fn() } as unknown as jest.Mocked<AuditLogRepository>;
    refundService = { refund: jest.fn() } as unknown as jest.Mocked<RefundService>;
    eventEmitter = { emit: jest.fn() };

    service = new CreditService(
      prisma as unknown as PrismaService,
      walletRepository,
      transactionRepository,
      featurePricingRepository,
      auditLogRepository,
      refundService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
    );
  });

  describe('spend', () => {
    it('is idempotent — returns the existing transaction without touching the wallet', async () => {
      transactionRepository.findByIdempotencyKey.mockResolvedValue({ id: 'existing' } as never);

      const result = await service.spend('user-1', { amount: 30, idempotencyKey: 'k1' });

      expect(result).toEqual({ id: 'existing' });
      expect(walletRepository.ensureWallet).not.toHaveBeenCalled();
    });

    it('throws InsufficientCreditsException and writes no ledger row when the balance is too low', async () => {
      walletRepository.trySpend.mockResolvedValue(false);

      await expect(
        service.spend('user-1', { amount: 1000, idempotencyKey: 'k1' }),
      ).rejects.toBeInstanceOf(InsufficientCreditsException);
      expect(transactionRepository.create).not.toHaveBeenCalled();
    });

    it('writes a negative-amount CONSUMPTION row with the correct before/after balance and emits the event', async () => {
      const result = await service.spend('user-1', {
        amount: 30,
        reference: 'cv_improvement',
        idempotencyKey: 'k1',
      });

      const createCall = transactionRepository.create.mock.calls[0]!;
      expect(createCall[2]).toMatchObject({
        amount: -30,
        type: 'CONSUMPTION',
        balanceBefore: 100,
        balanceAfter: 70,
        reference: 'cv_improvement',
        idempotencyKey: 'k1',
      });
      expect(result).toEqual({ id: 'tx-new' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'credits.consumed',
        expect.objectContaining({ userId: 'user-1', amount: 30, reference: 'cv_improvement' }),
      );
    });

    it('participates in one atomic transaction — the wallet decrement and the ledger insert use the exact same transactional client', async () => {
      await service.spend('user-1', { amount: 30, idempotencyKey: 'k1' });

      const spendTxArg = walletRepository.trySpend.mock.calls[0]![0];
      const createTxArg = transactionRepository.create.mock.calls[0]![0];
      expect(spendTxArg).toBe(tx);
      expect(createTxArg).toBe(tx);
    });

    it('recovers from a concurrent idempotency-key race by returning the winning transaction', async () => {
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
      transactionRepository.findByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'race-winner' } as never);

      const result = await service.spend('user-1', { amount: 30, idempotencyKey: 'k1' });

      expect(result).toEqual({ id: 'race-winner' });
    });
  });

  describe('spendAndExecute', () => {
    it('does not refund when the work succeeds', async () => {
      const result = await service.spendAndExecute(
        'user-1',
        { amount: 30, idempotencyKey: 'k1' },
        async () => 'ok',
      );

      expect(result).toBe('ok');
      expect(refundService.refund).not.toHaveBeenCalled();
    });

    it('automatically refunds the charge and rethrows when the work throws', async () => {
      const workError = new Error('provider unavailable');

      await expect(
        service.spendAndExecute('user-1', { amount: 30, idempotencyKey: 'k1' }, async () => {
          throw workError;
        }),
      ).rejects.toBe(workError);

      expect(refundService.refund).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ originalTransactionId: 'tx-new', idempotencyKey: 'refund:k1' }),
      );
    });
  });

  describe('allocateFromPurchase', () => {
    it('is idempotent', async () => {
      transactionRepository.findByIdempotencyKey.mockResolvedValue({ id: 'existing' } as never);

      const result = await service.allocateFromPurchase('user-1', {
        packageId: 'pkg-1',
        totalCredits: 550,
        bonusCredits: 100,
        paymentId: 'pay-1',
        idempotencyKey: 'k1',
      });

      expect(result).toEqual([{ id: 'existing' }]);
    });

    it('rejects bonusCredits exceeding totalCredits', async () => {
      await expect(
        service.allocateFromPurchase('user-1', {
          packageId: 'pkg-1',
          totalCredits: 100,
          bonusCredits: 150,
          paymentId: 'pay-1',
          idempotencyKey: 'k1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('writes separate PURCHASE and BONUS rows and emits one event each', async () => {
      transactionRepository.create.mockResolvedValueOnce({
        id: 'tx-purchase',
        amount: 450,
      } as never);
      transactionRepository.create.mockResolvedValueOnce({ id: 'tx-bonus', amount: 100 } as never);

      const transactions = await service.allocateFromPurchase('user-1', {
        packageId: 'pkg-2',
        totalCredits: 550,
        bonusCredits: 100,
        paymentId: 'pay-1',
        idempotencyKey: 'k1',
      });

      expect(transactions).toHaveLength(2);
      const [purchaseCall, bonusCall] = transactionRepository.create.mock.calls;
      expect(purchaseCall![2]).toMatchObject({
        amount: 450,
        type: 'PURCHASE',
        idempotencyKey: 'k1',
      });
      expect(bonusCall![2]).toMatchObject({
        amount: 100,
        type: 'BONUS',
        idempotencyKey: 'k1:bonus',
      });
      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
    });

    it('writes only a PURCHASE row when there is no bonus', async () => {
      transactionRepository.create.mockResolvedValueOnce({
        id: 'tx-purchase',
        amount: 200,
      } as never);

      const transactions = await service.allocateFromPurchase('user-1', {
        packageId: 'pkg-1',
        totalCredits: 200,
        bonusCredits: 0,
        paymentId: 'pay-1',
        idempotencyKey: 'k1',
      });

      expect(transactions).toHaveLength(1);
      expect(transactionRepository.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('reverse', () => {
    it('throws NotFound for a missing or cross-user original transaction', async () => {
      transactionRepository.findById.mockResolvedValue(null);
      await expect(
        service.reverse('user-1', {
          originalTransactionId: 'tx-1',
          reason: 'x',
          idempotencyKey: 'k1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects reversing a non-PURCHASE/BONUS transaction', async () => {
      transactionRepository.findById.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        type: 'CONSUMPTION',
      } as never);
      await expect(
        service.reverse('user-1', {
          originalTransactionId: 'tx-1',
          reason: 'x',
          idempotencyKey: 'k1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws InsufficientCreditsException when the credits have already been spent', async () => {
      transactionRepository.findById.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        type: 'PURCHASE',
        amount: 200,
      } as never);
      walletRepository.tryDebit.mockResolvedValue(false);

      await expect(
        service.reverse('user-1', {
          originalTransactionId: 'tx-1',
          reason: 'chargeback',
          idempotencyKey: 'k1',
        }),
      ).rejects.toBeInstanceOf(InsufficientCreditsException);
    });

    it('writes a negative-amount REVERSAL row and emits the event', async () => {
      transactionRepository.findById.mockResolvedValue({
        id: 'tx-1',
        userId: 'user-1',
        type: 'PURCHASE',
        amount: 200,
      } as never);
      transactionRepository.create.mockResolvedValue({ id: 'tx-reversal' } as never);

      const result = await service.reverse('user-1', {
        originalTransactionId: 'tx-1',
        reason: 'chargeback',
        idempotencyKey: 'k1',
      });

      expect(walletRepository.tryDebit).toHaveBeenCalledWith(tx, 'user-1', 200);
      const createCall = transactionRepository.create.mock.calls[0]!;
      expect(createCall[2]).toMatchObject({ amount: -200, type: 'REVERSAL', reference: 'tx-1' });
      expect(result).toEqual({ id: 'tx-reversal' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'credits.reversed',
        expect.objectContaining({ amount: 200 }),
      );
    });
  });

  describe('adjustBalance', () => {
    it('rejects a zero amount', async () => {
      await expect(
        service.adjustBalance('admin-1', {
          userId: 'user-1',
          amount: 0,
          type: 'ADMIN_ADJUSTMENT',
          reason: 'x',
          idempotencyKey: 'k1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('credits the wallet, writes the transaction, and audit-logs a positive adjustment', async () => {
      transactionRepository.create.mockResolvedValue({ id: 'tx-adj' } as never);

      const result = await service.adjustBalance('admin-1', {
        userId: 'user-1',
        amount: 50,
        type: 'ADMIN_ADJUSTMENT',
        reason: 'Goodwill credit',
        idempotencyKey: 'k1',
      });

      expect(walletRepository.credit).toHaveBeenCalledWith(tx, 'user-1', 50);
      expect(auditLogRepository.create).toHaveBeenCalledWith(
        'admin-1',
        expect.objectContaining({
          action: 'credits.adjust',
          targetType: 'user',
          targetId: 'user-1',
          reason: 'Goodwill credit',
        }),
      );
      expect(result).toEqual({ id: 'tx-adj' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'credits.adjusted',
        expect.objectContaining({ adminId: 'admin-1', amount: 50 }),
      );
    });

    it('throws InsufficientCreditsException for a negative adjustment exceeding the balance, and does not audit-log', async () => {
      walletRepository.tryDebit.mockResolvedValue(false);

      await expect(
        service.adjustBalance('admin-1', {
          userId: 'user-1',
          amount: -500,
          type: 'ADMIN_ADJUSTMENT',
          reason: 'Correction',
          idempotencyKey: 'k1',
        }),
      ).rejects.toBeInstanceOf(InsufficientCreditsException);
      expect(auditLogRepository.create).not.toHaveBeenCalled();
    });

    it('debits (not credits) for a negative adjustment within balance', async () => {
      transactionRepository.create.mockResolvedValue({ id: 'tx-adj' } as never);

      await service.adjustBalance('admin-1', {
        userId: 'user-1',
        amount: -20,
        type: 'ADMIN_ADJUSTMENT',
        reason: 'Correction',
        idempotencyKey: 'k1',
      });

      expect(walletRepository.tryDebit).toHaveBeenCalledWith(tx, 'user-1', 20);
      expect(walletRepository.credit).not.toHaveBeenCalled();
    });
  });

  describe('listTransactions', () => {
    it('computes totalPages from total and limit', async () => {
      transactionRepository.findAllByUserId.mockResolvedValue({ items: [], total: 45 });

      const result = await service.listTransactions('user-1', { page: 2, limit: 20 });

      expect(result).toEqual({ items: [], total: 45, page: 2, limit: 20, totalPages: 3 });
    });
  });

  describe('estimate', () => {
    it('throws NotFound for an unknown or inactive feature', async () => {
      featurePricingRepository.findActiveByKey.mockResolvedValue(null);
      await expect(service.estimate('user-1', 'unknown_feature')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('reports sufficientBalance and balanceAfter correctly', async () => {
      featurePricingRepository.findActiveByKey.mockResolvedValue({
        featureKey: 'cv_improvement',
        cost: 30,
      } as never);
      walletRepository.ensureWallet.mockResolvedValue({ availableCredits: 100 } as never);

      const result = await service.estimate('user-1', 'cv_improvement');

      expect(result).toEqual({
        featureKey: 'cv_improvement',
        cost: 30,
        currentBalance: 100,
        sufficientBalance: true,
        balanceAfter: 70,
      });
    });

    it('reports sufficientBalance:false when the balance is too low', async () => {
      featurePricingRepository.findActiveByKey.mockResolvedValue({
        featureKey: 'interview_practice',
        cost: 60,
      } as never);
      walletRepository.ensureWallet.mockResolvedValue({ availableCredits: 10 } as never);

      const result = await service.estimate('user-1', 'interview_practice');

      expect(result.sufficientBalance).toBe(false);
      expect(result.balanceAfter).toBe(-50);
    });
  });
});
