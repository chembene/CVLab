import { ResumeVariantRepository } from './resume-variant.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('ResumeVariantRepository', () => {
  function buildPrismaMock() {
    const resumeVariant = {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    const prisma = { resumeVariant } as unknown as jest.Mocked<PrismaService>;
    return { prisma, resumeVariant };
  }

  it('update() does not bump version', async () => {
    const { prisma, resumeVariant } = buildPrismaMock();
    const repository = new ResumeVariantRepository(prisma);

    await repository.update('rv-1', { archived: true });

    expect(resumeVariant.update).toHaveBeenCalledWith({
      where: { id: 'rv-1' },
      data: { archived: true },
    });
  });

  it('applyEdit() bumps version via an atomic increment', async () => {
    const { prisma, resumeVariant } = buildPrismaMock();
    const repository = new ResumeVariantRepository(prisma);

    await repository.applyEdit('rv-1', { title: 'New title' });

    expect(resumeVariant.update).toHaveBeenCalledWith({
      where: { id: 'rv-1' },
      data: { title: 'New title', version: { increment: 1 } },
    });
  });

  it('softDelete() sets deletedAt', async () => {
    const { prisma, resumeVariant } = buildPrismaMock();
    const repository = new ResumeVariantRepository(prisma);

    await repository.softDelete('rv-1');

    const call = resumeVariant.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'rv-1' });
    expect(call.data.deletedAt).toBeInstanceOf(Date);
  });

  it('findAllByUserId() excludes soft-deleted rows', async () => {
    const { prisma, resumeVariant } = buildPrismaMock();
    const repository = new ResumeVariantRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(resumeVariant.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });
});
