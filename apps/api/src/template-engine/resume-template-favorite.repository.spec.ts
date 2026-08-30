import { ResumeTemplateFavoriteRepository } from './resume-template-favorite.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('ResumeTemplateFavoriteRepository', () => {
  function buildPrismaMock() {
    const resumeTemplateFavorite = {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    };
    const prisma = { resumeTemplateFavorite } as unknown as jest.Mocked<PrismaService>;
    return { prisma, resumeTemplateFavorite };
  }

  it('findOne() looks up by the composite unique key', async () => {
    const { prisma, resumeTemplateFavorite } = buildPrismaMock();
    const repository = new ResumeTemplateFavoriteRepository(prisma);

    await repository.findOne('user-1', 'modern');

    expect(resumeTemplateFavorite.findUnique).toHaveBeenCalledWith({
      where: { userId_templateId: { userId: 'user-1', templateId: 'modern' } },
    });
  });

  it('add() is idempotent — returns the existing row instead of inserting a duplicate', async () => {
    const { prisma, resumeTemplateFavorite } = buildPrismaMock();
    resumeTemplateFavorite.findUnique.mockResolvedValue({ id: 'fav-1' } as never);
    const repository = new ResumeTemplateFavoriteRepository(prisma);

    const result = await repository.add('user-1', 'modern');

    expect(resumeTemplateFavorite.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'fav-1' });
  });

  it('add() creates a new row when none exists yet', async () => {
    const { prisma, resumeTemplateFavorite } = buildPrismaMock();
    resumeTemplateFavorite.findUnique.mockResolvedValue(null);
    resumeTemplateFavorite.create.mockResolvedValue({ id: 'fav-1' } as never);
    const repository = new ResumeTemplateFavoriteRepository(prisma);

    await repository.add('user-1', 'modern');

    expect(resumeTemplateFavorite.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', templateId: 'modern' },
    });
  });

  it('remove() deletes by userId+templateId', async () => {
    const { prisma, resumeTemplateFavorite } = buildPrismaMock();
    const repository = new ResumeTemplateFavoriteRepository(prisma);

    await repository.remove('user-1', 'modern');

    expect(resumeTemplateFavorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', templateId: 'modern' },
    });
  });

  it('findAllTemplatesByUserId() unwraps the included template from each favorite row, newest first', async () => {
    const { prisma, resumeTemplateFavorite } = buildPrismaMock();
    resumeTemplateFavorite.findMany.mockResolvedValue([
      { template: { id: 'modern' } },
      { template: { id: 'minimal' } },
    ] as never);
    const repository = new ResumeTemplateFavoriteRepository(prisma);

    const result = await repository.findAllTemplatesByUserId('user-1');

    expect(resumeTemplateFavorite.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      include: { template: true },
    });
    expect(result).toEqual([{ id: 'modern' }, { id: 'minimal' }]);
  });
});
