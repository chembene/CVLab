import { JobTargetRepository } from './job-target.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('JobTargetRepository', () => {
  function buildPrismaMock() {
    const jobTargetKeyword = { deleteMany: jest.fn(), createMany: jest.fn() };
    const jobTargetSkill = { deleteMany: jest.fn(), createMany: jest.fn() };
    const jobTargetLanguage = { deleteMany: jest.fn(), createMany: jest.fn() };
    const prisma = {
      jobTargetKeyword,
      jobTargetSkill,
      jobTargetLanguage,
      $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
    } as unknown as jest.Mocked<PrismaService>;
    return { prisma, jobTargetKeyword, jobTargetSkill, jobTargetLanguage };
  }

  it('replaceKeywords deletes and recreates the full set in one transaction', async () => {
    const { prisma, jobTargetKeyword } = buildPrismaMock();
    const repository = new JobTargetRepository(prisma);

    await repository.replaceKeywords('jt-1', [{ keyword: 'nestjs', weight: 5 }]);

    expect(jobTargetKeyword.deleteMany).toHaveBeenCalledWith({ where: { jobTargetId: 'jt-1' } });
    expect(jobTargetKeyword.createMany).toHaveBeenCalledWith({
      data: [{ jobTargetId: 'jt-1', keyword: 'nestjs', weight: 5 }],
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('replaceKeywords skips createMany when the new set is empty (deletes only)', async () => {
    const { prisma, jobTargetKeyword } = buildPrismaMock();
    const repository = new JobTargetRepository(prisma);

    await repository.replaceKeywords('jt-1', []);

    expect(jobTargetKeyword.deleteMany).toHaveBeenCalled();
    expect(jobTargetKeyword.createMany).not.toHaveBeenCalled();
  });

  it('replaceSkills defaults `required` to false when not provided', async () => {
    const { prisma, jobTargetSkill } = buildPrismaMock();
    const repository = new JobTargetRepository(prisma);

    await repository.replaceSkills('jt-1', [{ skill: 'TypeScript' }]);

    expect(jobTargetSkill.createMany).toHaveBeenCalledWith({
      data: [{ jobTargetId: 'jt-1', skill: 'TypeScript', required: false }],
    });
  });

  it('replaceLanguages passes through the level field', async () => {
    const { prisma, jobTargetLanguage } = buildPrismaMock();
    const repository = new JobTargetRepository(prisma);

    await repository.replaceLanguages('jt-1', [{ language: 'English', level: 'FLUENT' }]);

    expect(jobTargetLanguage.createMany).toHaveBeenCalledWith({
      data: [{ jobTargetId: 'jt-1', language: 'English', level: 'FLUENT' }],
    });
  });
});
