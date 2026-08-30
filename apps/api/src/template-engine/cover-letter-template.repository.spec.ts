import { CoverLetterTemplateRepository } from './cover-letter-template.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('CoverLetterTemplateRepository', () => {
  function buildPrismaMock() {
    const coverLetterTemplate = {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    };
    const coverLetter = { findMany: jest.fn() };
    const prisma = { coverLetterTemplate, coverLetter } as unknown as jest.Mocked<PrismaService>;
    return { prisma, coverLetterTemplate, coverLetter };
  }

  it('findAll() always filters to ACTIVE status, and layers on optional filters when given', async () => {
    const { prisma, coverLetterTemplate } = buildPrismaMock();
    const repository = new CoverLetterTemplateRepository(prisma);

    await repository.findAll({ category: 'PROFESSIONAL', atsFriendly: true });

    expect(coverLetterTemplate.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', category: 'PROFESSIONAL', isATSFriendly: true },
      orderBy: { name: 'asc' },
    });
  });

  it('findById() filters to ACTIVE status', async () => {
    const { prisma, coverLetterTemplate } = buildPrismaMock();
    const repository = new CoverLetterTemplateRepository(prisma);

    await repository.findById('cl-modern');

    expect(coverLetterTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'cl-modern', status: 'ACTIVE' },
    });
  });

  it('findByIdUnfiltered() does not filter by status', async () => {
    const { prisma, coverLetterTemplate } = buildPrismaMock();
    const repository = new CoverLetterTemplateRepository(prisma);

    await repository.findByIdUnfiltered('cl-modern');

    expect(coverLetterTemplate.findUnique).toHaveBeenCalledWith({ where: { id: 'cl-modern' } });
  });

  it('findRecentlyUsedByUserId() queries distinct-by-templateId on cover_letters, newest-updated first', async () => {
    const { prisma, coverLetter } = buildPrismaMock();
    coverLetter.findMany.mockResolvedValue([{ template: { id: 'cl-modern' } }] as never);
    const repository = new CoverLetterTemplateRepository(prisma);

    const result = await repository.findRecentlyUsedByUserId('user-1', 5);

    expect(coverLetter.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', templateId: { not: null }, deletedAt: null },
      distinct: ['templateId'],
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { template: true },
    });
    expect(result).toEqual([{ id: 'cl-modern' }]);
  });
});
