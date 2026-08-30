import { ResumeTemplateRepository } from './resume-template.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('ResumeTemplateRepository', () => {
  function buildPrismaMock() {
    const resumeTemplate = { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() };
    const resumeVariant = { findMany: jest.fn() };
    const prisma = { resumeTemplate, resumeVariant } as unknown as jest.Mocked<PrismaService>;
    return { prisma, resumeTemplate, resumeVariant };
  }

  it('findAll() always filters to ACTIVE status, and layers on optional filters when given', async () => {
    const { prisma, resumeTemplate } = buildPrismaMock();
    const repository = new ResumeTemplateRepository(prisma);

    await repository.findAll({ category: 'MODERN', atsFriendly: true, premium: false });

    expect(resumeTemplate.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE', category: 'MODERN', isATSFriendly: true, premium: false },
      orderBy: { name: 'asc' },
    });
  });

  it('findAll() with no filters only constrains on status', async () => {
    const { prisma, resumeTemplate } = buildPrismaMock();
    const repository = new ResumeTemplateRepository(prisma);

    await repository.findAll({});

    expect(resumeTemplate.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      orderBy: { name: 'asc' },
    });
  });

  it('findById() filters to ACTIVE status', async () => {
    const { prisma, resumeTemplate } = buildPrismaMock();
    const repository = new ResumeTemplateRepository(prisma);

    await repository.findById('modern');

    expect(resumeTemplate.findFirst).toHaveBeenCalledWith({
      where: { id: 'modern', status: 'ACTIVE' },
    });
  });

  it('findByIdUnfiltered() does not filter by status', async () => {
    const { prisma, resumeTemplate } = buildPrismaMock();
    const repository = new ResumeTemplateRepository(prisma);

    await repository.findByIdUnfiltered('modern');

    expect(resumeTemplate.findUnique).toHaveBeenCalledWith({ where: { id: 'modern' } });
  });

  it('findRecentlyUsedByUserId() queries distinct-by-templateId, newest-updated first, and unwraps the included template', async () => {
    const { prisma, resumeVariant } = buildPrismaMock();
    resumeVariant.findMany.mockResolvedValue([
      { template: { id: 'modern' } },
      { template: { id: 'minimal' } },
    ] as never);
    const repository = new ResumeTemplateRepository(prisma);

    const result = await repository.findRecentlyUsedByUserId('user-1', 5);

    expect(resumeVariant.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', templateId: { not: null }, deletedAt: null },
      distinct: ['templateId'],
      orderBy: { updatedAt: 'desc' },
      take: 5,
      include: { template: true },
    });
    expect(result).toEqual([{ id: 'modern' }, { id: 'minimal' }]);
  });

  it('findRecentlyUsedByUserId() silently drops any variant whose included template ended up null', async () => {
    const { prisma, resumeVariant } = buildPrismaMock();
    resumeVariant.findMany.mockResolvedValue([
      { template: null },
      { template: { id: 'modern' } },
    ] as never);
    const repository = new ResumeTemplateRepository(prisma);

    const result = await repository.findRecentlyUsedByUserId('user-1', 5);

    expect(result).toEqual([{ id: 'modern' }]);
  });
});
