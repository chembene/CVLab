import { CoverLetterRepository } from './cover-letter.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('CoverLetterRepository', () => {
  function buildPrismaMock() {
    const coverLetter = {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    };
    const prisma = { coverLetter } as unknown as jest.Mocked<PrismaService>;
    return { prisma, coverLetter };
  }

  it('create() writes every provided field', async () => {
    const { prisma, coverLetter } = buildPrismaMock();
    const repository = new CoverLetterRepository(prisma);
    const data = {
      resumeVariantId: 'rv-1',
      jobTargetId: 'jt-1',
      title: 'Title',
      content: 'Body',
      tone: 'PROFESSIONAL' as const,
      language: 'en',
      version: 1,
      status: 'GENERATED' as const,
      creditsUsed: 40,
      generatedByAI: true,
    };

    await repository.create('user-1', data);

    expect(coverLetter.create).toHaveBeenCalledWith({ data: { userId: 'user-1', ...data } });
  });

  it('findAllByUserId() excludes soft-deleted rows and orders most-recent-first', async () => {
    const { prisma, coverLetter } = buildPrismaMock();
    const repository = new CoverLetterRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(coverLetter.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findById() excludes soft-deleted rows', async () => {
    const { prisma, coverLetter } = buildPrismaMock();
    const repository = new CoverLetterRepository(prisma);

    await repository.findById('cl-1');

    expect(coverLetter.findFirst).toHaveBeenCalledWith({ where: { id: 'cl-1', deletedAt: null } });
  });

  it('update() writes only the given partial fields', async () => {
    const { prisma, coverLetter } = buildPrismaMock();
    const repository = new CoverLetterRepository(prisma);

    await repository.update('cl-1', { status: 'EDITED' });

    expect(coverLetter.update).toHaveBeenCalledWith({
      where: { id: 'cl-1' },
      data: { status: 'EDITED' },
    });
  });

  it('softDelete() sets deletedAt', async () => {
    const { prisma, coverLetter } = buildPrismaMock();
    const repository = new CoverLetterRepository(prisma);

    await repository.softDelete('cl-1');

    expect(coverLetter.update).toHaveBeenCalledWith({
      where: { id: 'cl-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });
});
