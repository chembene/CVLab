import { ResumeVersionRepository } from './resume-version.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('ResumeVersionRepository', () => {
  function buildPrismaMock() {
    const resumeVariantVersion = {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    };
    const prisma = { resumeVariantVersion } as unknown as jest.Mocked<PrismaService>;
    return { prisma, resumeVariantVersion };
  }

  it('create() writes a version row as given', async () => {
    const { prisma, resumeVariantVersion } = buildPrismaMock();
    const repository = new ResumeVersionRepository(prisma);
    const data = {
      resumeVariantId: 'rv-1',
      versionNumber: 2,
      content: { summary: 'x' },
      label: 'MANUAL_EDIT' as const,
      source: 'USER' as const,
      createdByUserId: 'user-1',
    };

    await repository.create(data);

    expect(resumeVariantVersion.create).toHaveBeenCalledWith({ data });
  });

  it('findAllByVariantId() filters through the resumeVariant relation for ownership + soft-delete, newest first', async () => {
    const { prisma, resumeVariantVersion } = buildPrismaMock();
    const repository = new ResumeVersionRepository(prisma);

    await repository.findAllByVariantId('rv-1', 'user-1');

    expect(resumeVariantVersion.findMany).toHaveBeenCalledWith({
      where: { resumeVariantId: 'rv-1', resumeVariant: { userId: 'user-1', deletedAt: null } },
      orderBy: { versionNumber: 'desc' },
    });
  });

  it('findOneByVariantAndNumber() filters by owner and exact version number', async () => {
    const { prisma, resumeVariantVersion } = buildPrismaMock();
    const repository = new ResumeVersionRepository(prisma);

    await repository.findOneByVariantAndNumber('rv-1', 3, 'user-1');

    expect(resumeVariantVersion.findFirst).toHaveBeenCalledWith({
      where: {
        resumeVariantId: 'rv-1',
        versionNumber: 3,
        resumeVariant: { userId: 'user-1', deletedAt: null },
      },
    });
  });

  it('findLatestByVariantId() is unfiltered by owner and orders by versionNumber desc', async () => {
    const { prisma, resumeVariantVersion } = buildPrismaMock();
    const repository = new ResumeVersionRepository(prisma);

    await repository.findLatestByVariantId('rv-1');

    expect(resumeVariantVersion.findFirst).toHaveBeenCalledWith({
      where: { resumeVariantId: 'rv-1' },
      orderBy: { versionNumber: 'desc' },
    });
  });

  it('findOneByVariantAndNumberUnfiltered() is unfiltered by owner', async () => {
    const { prisma, resumeVariantVersion } = buildPrismaMock();
    const repository = new ResumeVersionRepository(prisma);

    await repository.findOneByVariantAndNumberUnfiltered('rv-1', 3);

    expect(resumeVariantVersion.findFirst).toHaveBeenCalledWith({
      where: { resumeVariantId: 'rv-1', versionNumber: 3 },
    });
  });

  it('findByIdWithinVariant() (Export Engine) filters by row id, the given variant, and owner in one query', async () => {
    const { prisma, resumeVariantVersion } = buildPrismaMock();
    const repository = new ResumeVersionRepository(prisma);

    await repository.findByIdWithinVariant('version-1', 'rv-1', 'user-1');

    expect(resumeVariantVersion.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'version-1',
        resumeVariantId: 'rv-1',
        resumeVariant: { userId: 'user-1', deletedAt: null },
      },
    });
  });
});
