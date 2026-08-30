import { PaymentRepository } from './payment.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('PaymentRepository', () => {
  function buildPrismaMock() {
    const payment = {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    };
    const prisma = { payment } as unknown as jest.Mocked<PrismaService>;
    return { prisma, payment };
  }

  it('create() always starts a payment as PENDING', async () => {
    const { prisma, payment } = buildPrismaMock();
    const repository = new PaymentRepository(prisma);
    const data = {
      userId: 'u1',
      packageId: 'pkg-1',
      provider: 'MPESA' as const,
      amount: 100,
      currency: 'MZN',
      expiresAt: new Date(),
    };

    await repository.create(data);

    expect(payment.create).toHaveBeenCalledWith({ data: { ...data, status: 'PENDING' } });
  });

  it('findByProviderReference() queries the compound unique (provider, providerReference)', async () => {
    const { prisma, payment } = buildPrismaMock();
    const repository = new PaymentRepository(prisma);

    await repository.findByProviderReference('MPESA', 'ref-1');

    expect(payment.findUnique).toHaveBeenCalledWith({
      where: { provider_providerReference: { provider: 'MPESA', providerReference: 'ref-1' } },
    });
  });

  it('findAllByUserId() orders newest first', async () => {
    const { prisma, payment } = buildPrismaMock();
    const repository = new PaymentRepository(prisma);

    await repository.findAllByUserId('u1');

    expect(payment.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('markStatus() sets the given status plus any extra fields', async () => {
    const { prisma, payment } = buildPrismaMock();
    const repository = new PaymentRepository(prisma);

    await repository.markStatus('p1', 'FAILED', { metadata: { failureReason: 'boom' } });

    expect(payment.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { status: 'FAILED', metadata: { failureReason: 'boom' } },
    });
  });
});
