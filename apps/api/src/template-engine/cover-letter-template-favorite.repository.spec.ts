import { CoverLetterTemplateFavoriteRepository } from './cover-letter-template-favorite.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('CoverLetterTemplateFavoriteRepository', () => {
  function buildPrismaMock() {
    const coverLetterTemplateFavorite = {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    };
    const prisma = { coverLetterTemplateFavorite } as unknown as jest.Mocked<PrismaService>;
    return { prisma, coverLetterTemplateFavorite };
  }

  it('findOne() looks up by the composite unique key', async () => {
    const { prisma, coverLetterTemplateFavorite } = buildPrismaMock();
    const repository = new CoverLetterTemplateFavoriteRepository(prisma);

    await repository.findOne('user-1', 'cl-modern');

    expect(coverLetterTemplateFavorite.findUnique).toHaveBeenCalledWith({
      where: { userId_templateId: { userId: 'user-1', templateId: 'cl-modern' } },
    });
  });

  it('add() is idempotent — returns the existing row instead of inserting a duplicate', async () => {
    const { prisma, coverLetterTemplateFavorite } = buildPrismaMock();
    coverLetterTemplateFavorite.findUnique.mockResolvedValue({ id: 'fav-1' } as never);
    const repository = new CoverLetterTemplateFavoriteRepository(prisma);

    const result = await repository.add('user-1', 'cl-modern');

    expect(coverLetterTemplateFavorite.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'fav-1' });
  });

  it('remove() deletes by userId+templateId', async () => {
    const { prisma, coverLetterTemplateFavorite } = buildPrismaMock();
    const repository = new CoverLetterTemplateFavoriteRepository(prisma);

    await repository.remove('user-1', 'cl-modern');

    expect(coverLetterTemplateFavorite.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', templateId: 'cl-modern' },
    });
  });

  it('findAllTemplatesByUserId() unwraps the included template from each favorite row', async () => {
    const { prisma, coverLetterTemplateFavorite } = buildPrismaMock();
    coverLetterTemplateFavorite.findMany.mockResolvedValue([
      { template: { id: 'cl-modern' } },
    ] as never);
    const repository = new CoverLetterTemplateFavoriteRepository(prisma);

    const result = await repository.findAllTemplatesByUserId('user-1');

    expect(result).toEqual([{ id: 'cl-modern' }]);
  });
});
