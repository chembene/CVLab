import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RefundService } from './refund.service';
import type { WalletRepository } from './wallet.repository';
import type { CreditTransactionRepository } from './credit-transaction.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('RefundService', () => {
  let prisma: { $transaction: jest.Mock };
  let walletRepository: jest.Mocked<WalletRepository>;
  let transactionRepository: jest.Mocked<CreditTransactionRepository>;
  let eventEmitter: { emit: jest.Mock };
  let service: RefundService;
  let tx: { creditWallet: { findUniqueOrThrow: jest.Mock } };

  beforeEach(() => {
    tx = {
      creditWallet: { findUniqueOrThrow: jest.fn().mockResolvedValue({ availableCredits: 70 }) },
    };
    prisma = { $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)) };
    walletRepository = { credit: jest.fn() } as unknown as jest.Mocked<WalletRepository>;
    transactionRepository = {
      findByIdempotencyKey: jest.fn(),
      findById: jest.fn(),
      findByReferenceAndType: jest.fn(),
      create: jest.fn(),
    } as unknown as jest.Mocked<CreditTransactionRepository>;
    eventEmitter = { emit: jest.fn() };
    service = new RefundService(
      prisma as unknown as PrismaService,
      walletRepository,
      transactionRepository,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
    );
  });

  it('is idempotent — returns the existing transaction without re-processing when the key was already used', async () => {
    transactionRepository.findByIdempotencyKey.mockResolvedValue({
      id: 'refund-existing',
    } as never);

    const result = await service.refund('user-1', {
      originalTransactionId: 'tx-1',
      reason: 'x',
      idempotencyKey: 'k1',
    });

    expect(result).toEqual({ id: 'refund-existing' });
    expect(transactionRepository.findById).not.toHaveBeenCalled();
  });

  it('throws NotFound when the original transaction does not exist or belongs to another user', async () => {
    transactionRepository.findByIdempotencyKey.mockResolvedValue(null);
    transactionRepository.findById.mockResolvedValue({
      id: 'tx-1',
      userId: 'someone-else',
    } as never);

    await expect(
      service.refund('user-1', {
        originalTransactionId: 'tx-1',
        reason: 'x',
        idempotencyKey: 'k1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects refunding a non-CONSUMPTION transaction', async () => {
    transactionRepository.findByIdempotencyKey.mockResolvedValue(null);
    transactionRepository.findById.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      type: 'PURCHASE',
    } as never);

    await expect(
      service.refund('user-1', {
        originalTransactionId: 'tx-1',
        reason: 'x',
        idempotencyKey: 'k1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('is idempotent against a different key too — never refunds the same original transaction twice', async () => {
    transactionRepository.findByIdempotencyKey.mockResolvedValue(null);
    transactionRepository.findById.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      type: 'CONSUMPTION',
      amount: -30,
    } as never);
    transactionRepository.findByReferenceAndType.mockResolvedValue({
      id: 'refund-already-done',
    } as never);

    const result = await service.refund('user-1', {
      originalTransactionId: 'tx-1',
      reason: 'x',
      idempotencyKey: 'k2',
    });

    expect(result).toEqual({ id: 'refund-already-done' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('credits the wallet back and writes a REFUND row for the absolute amount, then emits the event', async () => {
    transactionRepository.findByIdempotencyKey.mockResolvedValue(null);
    transactionRepository.findById.mockResolvedValue({
      id: 'tx-1',
      userId: 'user-1',
      type: 'CONSUMPTION',
      amount: -30,
    } as never);
    transactionRepository.findByReferenceAndType.mockResolvedValue(null);
    transactionRepository.create.mockResolvedValue({ id: 'refund-1' } as never);

    const result = await service.refund('user-1', {
      originalTransactionId: 'tx-1',
      reason: 'Op failed',
      idempotencyKey: 'k1',
    });

    expect(walletRepository.credit).toHaveBeenCalledWith(tx, 'user-1', 30);
    const createCall = transactionRepository.create.mock.calls[0]!;
    expect(createCall[2]).toMatchObject({
      amount: 30,
      type: 'REFUND',
      balanceBefore: 70,
      balanceAfter: 100,
      reference: 'tx-1',
      description: 'Op failed',
      idempotencyKey: 'k1',
    });
    expect(result).toEqual({ id: 'refund-1' });
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'credits.refunded',
      expect.objectContaining({
        userId: 'user-1',
        transactionId: 'refund-1',
        amount: 30,
        originalTransactionId: 'tx-1',
      }),
    );
  });
});
