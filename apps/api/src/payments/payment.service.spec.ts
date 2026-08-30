import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PaymentService } from './payment.service';
import type { PaymentRepository } from './payment.repository';
import type { CreditPackageRepository } from '../credits/credit-package.repository';
import type { BillingProviderRegistry } from '../billing/billing-provider.registry';
import type { CreditService } from '../credits/credit.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('PaymentService', () => {
  let repository: jest.Mocked<PaymentRepository>;
  let creditPackageRepository: jest.Mocked<CreditPackageRepository>;
  let billingProviderRegistry: jest.Mocked<BillingProviderRegistry>;
  let creditService: jest.Mocked<CreditService>;
  let configService: { get: jest.Mock };
  let service: PaymentService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const pkg = {
    id: 'pkg-1',
    priceMt: 100,
    baseCredits: 200,
    bonusCredits: 0,
    totalCredits: 200,
    active: true,
  };
  const pendingPayment = {
    id: 'pay-1',
    userId: 'user-1',
    packageId: 'pkg-1',
    provider: 'MPESA',
    providerReference: null as string | null,
    amount: 100,
    currency: 'MZN',
    status: 'PENDING',
    metadata: null,
    expiresAt: new Date(Date.now() + 30 * 60_000),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockProvider: {
    provider: string;
    createPayment: jest.Mock;
    checkPaymentStatus: jest.Mock;
    processCallback: jest.Mock;
    cancelPayment: jest.Mock;
    reversePayment: jest.Mock;
  };

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(pendingPayment),
      findById: jest.fn().mockResolvedValue(pendingPayment),
      findByProviderReference: jest.fn(),
      findAllByUserId: jest.fn().mockResolvedValue([]),
      update: jest
        .fn()
        .mockImplementation((_id, data) => Promise.resolve({ ...pendingPayment, ...data })),
      markStatus: jest
        .fn()
        .mockImplementation((_id, status, extra = {}) =>
          Promise.resolve({ ...pendingPayment, status, ...extra }),
        ),
    } as unknown as jest.Mocked<PaymentRepository>;

    creditPackageRepository = {
      findActiveById: jest.fn().mockResolvedValue(pkg),
      findById: jest.fn().mockResolvedValue(pkg),
      findAllActive: jest.fn(),
    } as unknown as jest.Mocked<CreditPackageRepository>;

    mockProvider = {
      provider: 'MPESA',
      createPayment: jest.fn().mockResolvedValue({ providerReference: 'mpesa-ref-1' }),
      checkPaymentStatus: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
      processCallback: jest
        .fn()
        .mockResolvedValue({ providerReference: 'mpesa-ref-1', status: 'COMPLETED' }),
      cancelPayment: jest.fn(),
      reversePayment: jest.fn(),
    };
    billingProviderRegistry = {
      get: jest.fn().mockReturnValue(mockProvider),
    } as unknown as jest.Mocked<BillingProviderRegistry>;

    creditService = {
      allocateFromPurchase: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CreditService>;
    configService = { get: jest.fn().mockReturnValue(undefined) };

    service = new PaymentService(
      repository,
      creditPackageRepository,
      billingProviderRegistry,
      creditService,
      configService as never,
    );
  });

  describe('create', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(
        service.create(stranger, 'user-1', { packageId: 'pkg-1', provider: 'MPESA' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for an unknown/inactive package', async () => {
      creditPackageRepository.findActiveById.mockResolvedValue(null);
      await expect(
        service.create(owner, 'user-1', { packageId: 'pkg-1', provider: 'MPESA' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a PENDING payment with amount/currency derived from the package, never the client', async () => {
      await service.create(owner, 'user-1', { packageId: 'pkg-1', provider: 'MPESA' } as never);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          packageId: 'pkg-1',
          provider: 'MPESA',
          amount: pkg.priceMt,
          currency: 'MZN',
        }),
      );
    });

    it('calls the resolved provider.createPayment() with a deterministic idempotency key', async () => {
      await service.create(owner, 'user-1', { packageId: 'pkg-1', provider: 'MPESA' } as never);
      expect(billingProviderRegistry.get).toHaveBeenCalledWith('MPESA');
      expect(mockProvider.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          packageId: 'pkg-1',
          amount: 100,
          currency: 'MZN',
          idempotencyKey: 'payment:pay-1',
        }),
      );
    });

    it('on provider success, marks the payment PROCESSING with the providerReference', async () => {
      await service.create(owner, 'user-1', { packageId: 'pkg-1', provider: 'MPESA' } as never);
      expect(repository.update).toHaveBeenCalledWith(
        'pay-1',
        expect.objectContaining({ status: 'PROCESSING', providerReference: 'mpesa-ref-1' }),
      );
    });

    it('on provider failure, marks the payment FAILED with the reason and rethrows — never leaves it dangling at PENDING', async () => {
      const failure = new Error('M-Pesa integration is not implemented yet.');
      mockProvider.createPayment.mockRejectedValue(failure);

      await expect(
        service.create(owner, 'user-1', { packageId: 'pkg-1', provider: 'MPESA' } as never),
      ).rejects.toBe(failure);

      expect(repository.markStatus).toHaveBeenCalledWith('pay-1', 'FAILED', {
        metadata: { failureReason: failure.message },
      });
    });
  });

  describe('verify', () => {
    it('throws NotFound for a payment belonging to another user', async () => {
      repository.findById.mockResolvedValue({ ...pendingPayment, userId: 'user-2' } as never);
      await expect(service.verify(owner, 'user-1', 'pay-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws BadRequest when the payment has no providerReference yet', async () => {
      repository.findById.mockResolvedValue(pendingPayment as never);
      await expect(service.verify(owner, 'user-1', 'pay-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('checks status via the provider and confirms the payment when COMPLETED, allocating credits', async () => {
      const withRef = { ...pendingPayment, providerReference: 'mpesa-ref-1' };
      repository.findById.mockResolvedValue(withRef as never);

      await service.verify(owner, 'user-1', 'pay-1');

      expect(mockProvider.checkPaymentStatus).toHaveBeenCalledWith('mpesa-ref-1');
      expect(creditService.allocateFromPurchase).toHaveBeenCalledWith('user-1', {
        packageId: 'pkg-1',
        totalCredits: 200,
        bonusCredits: 0,
        paymentId: 'pay-1',
        idempotencyKey: 'payment:pay-1',
      });
      expect(repository.update).toHaveBeenCalledWith(
        'pay-1',
        expect.objectContaining({
          status: 'COMPLETED',
          providerReference: 'mpesa-ref-1',
          completedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('handleCallback', () => {
    it("safely no-ops when no Payment matches the callback's providerReference", async () => {
      repository.findByProviderReference.mockResolvedValue(null);
      await service.handleCallback('MPESA', { raw: true });
      expect(creditService.allocateFromPurchase).not.toHaveBeenCalled();
    });

    it('confirms and allocates credits for a matching PENDING/PROCESSING payment', async () => {
      const withRef = { ...pendingPayment, status: 'PROCESSING', providerReference: 'mpesa-ref-1' };
      repository.findByProviderReference.mockResolvedValue(withRef as never);
      repository.findById.mockResolvedValue(withRef as never);

      await service.handleCallback('MPESA', { raw: true });

      expect(creditService.allocateFromPurchase).toHaveBeenCalledTimes(1);
    });

    it('is idempotent — a duplicate callback for an already-COMPLETED payment never allocates credits again', async () => {
      const completed = {
        ...pendingPayment,
        status: 'COMPLETED',
        providerReference: 'mpesa-ref-1',
      };
      repository.findByProviderReference.mockResolvedValue(completed as never);
      repository.findById.mockResolvedValue(completed as never);

      await service.handleCallback('MPESA', { raw: true });

      expect(creditService.allocateFromPurchase).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('rejects a provider reference mismatch between the stored payment and the callback result', async () => {
      const withDifferentRef = { ...pendingPayment, providerReference: 'some-other-ref' };
      repository.findByProviderReference.mockResolvedValue(withDifferentRef as never);
      repository.findById.mockResolvedValue(withDifferentRef as never);

      await expect(service.handleCallback('MPESA', { raw: true })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(creditService.allocateFromPurchase).not.toHaveBeenCalled();
    });

    it('marks an expired PENDING payment EXPIRED instead of granting credits', async () => {
      const expired = {
        ...pendingPayment,
        providerReference: 'mpesa-ref-1',
        expiresAt: new Date(Date.now() - 1000),
      };
      repository.findByProviderReference.mockResolvedValue(expired as never);
      repository.findById.mockResolvedValue(expired as never);

      await service.handleCallback('MPESA', { raw: true });

      expect(creditService.allocateFromPurchase).not.toHaveBeenCalled();
      expect(repository.markStatus).toHaveBeenCalledWith('pay-1', 'EXPIRED');
    });

    it('updates the status without allocating credits when the callback reports a non-COMPLETED status', async () => {
      mockProvider.processCallback.mockResolvedValue({
        providerReference: 'mpesa-ref-1',
        status: 'FAILED',
      });
      const withRef = { ...pendingPayment, providerReference: 'mpesa-ref-1' };
      repository.findByProviderReference.mockResolvedValue(withRef as never);
      repository.findById.mockResolvedValue(withRef as never);

      await service.handleCallback('MPESA', { raw: true });

      expect(creditService.allocateFromPurchase).not.toHaveBeenCalled();
      expect(repository.markStatus).toHaveBeenCalledWith('pay-1', 'FAILED', {
        providerReference: 'mpesa-ref-1',
      });
    });
  });

  describe('list / getOne', () => {
    it('list() denies a non-owner', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('getOne() lazily expires a stale PENDING payment on read', async () => {
      const stale = { ...pendingPayment, expiresAt: new Date(Date.now() - 1000) };
      repository.findById.mockResolvedValue(stale as never);

      const result = await service.getOne(owner, 'user-1', 'pay-1');

      expect(repository.markStatus).toHaveBeenCalledWith('pay-1', 'EXPIRED');
      expect(result.status).toBe('EXPIRED');
    });

    it('getOne() leaves a non-expired PENDING payment untouched', async () => {
      const result = await service.getOne(owner, 'user-1', 'pay-1');
      expect(repository.markStatus).not.toHaveBeenCalled();
      expect(result.status).toBe('PENDING');
    });
  });
});
