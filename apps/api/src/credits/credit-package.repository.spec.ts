import { CreditPackageRepository } from './credit-package.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('CreditPackageRepository', () => {
  function buildPrismaMock() {
    const creditPackage = { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() };
    const prisma = { creditPackage } as unknown as jest.Mocked<PrismaService>;
    return { prisma, creditPackage };
  }

  it('findAllActive() filters by active and orders by price ascending', async () => {
    const { prisma, creditPackage } = buildPrismaMock();
    const repository = new CreditPackageRepository(prisma);

    await repository.findAllActive();

    expect(creditPackage.findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: { priceMt: 'asc' },
    });
  });

  it('findActiveById() filters by id and active', async () => {
    const { prisma, creditPackage } = buildPrismaMock();
    const repository = new CreditPackageRepository(prisma);

    await repository.findActiveById('pkg-1');

    expect(creditPackage.findFirst).toHaveBeenCalledWith({ where: { id: 'pkg-1', active: true } });
  });

  it('findById() does not filter by active — an already-referenced package must still resolve even if deactivated later', async () => {
    const { prisma, creditPackage } = buildPrismaMock();
    const repository = new CreditPackageRepository(prisma);

    await repository.findById('pkg-1');

    expect(creditPackage.findUnique).toHaveBeenCalledWith({ where: { id: 'pkg-1' } });
  });
});
