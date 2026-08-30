import { ResumeOptimizationRepository } from './resume-optimization.repository';
import type { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '@prisma/client';

describe('ResumeOptimizationRepository', () => {
  function buildPrismaMock() {
    const resumeOptimization = {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    };
    const optimizationSuggestion = { updateMany: jest.fn() };
    const prisma = { resumeOptimization } as unknown as jest.Mocked<PrismaService>;
    return { prisma, resumeOptimization, optimizationSuggestion };
  }

  it('create() writes a PENDING row (status defaulted by Prisma, not set explicitly here)', async () => {
    const { prisma, resumeOptimization } = buildPrismaMock();
    const repository = new ResumeOptimizationRepository(prisma);

    await repository.create('user-1', {
      resumeVariantId: 'rv-1',
      jobTargetId: 'jt-1',
      atsReportId: 'ats-1',
      beforeScore: 55,
    });

    expect(resumeOptimization.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        resumeVariantId: 'rv-1',
        jobTargetId: 'jt-1',
        atsReportId: 'ats-1',
        beforeScore: 55,
      },
    });
  });

  it('completeWithSuggestions() sets status COMPLETED and nested-creates every suggestion in one write', async () => {
    const { prisma, resumeOptimization } = buildPrismaMock();
    const repository = new ResumeOptimizationRepository(prisma);
    const suggestions = [
      {
        type: 'SUMMARY' as const,
        section: 'summary',
        title: 'Sharpen it',
        reason: 'Too generic',
        priority: 'HIGH' as const,
        originalText: 'Old',
        suggestedText: 'New',
        displayOrder: 0,
      },
    ];

    await repository.completeWithSuggestions('opt-1', {
      creditsUsed: 80,
      predictedScore: 90,
      summary: 'Overview',
      suggestions,
    });

    expect(resumeOptimization.update).toHaveBeenCalledWith({
      where: { id: 'opt-1' },
      data: {
        status: 'COMPLETED',
        creditsUsed: 80,
        predictedScore: 90,
        summary: 'Overview',
        suggestions: { createMany: { data: suggestions } },
      },
      include: { suggestions: { where: { deletedAt: null }, orderBy: { displayOrder: 'asc' } } },
    });
  });

  it('markFailed() sets status FAILED without touching any other field', async () => {
    const { prisma, resumeOptimization } = buildPrismaMock();
    const repository = new ResumeOptimizationRepository(prisma);

    await repository.markFailed('opt-1');

    expect(resumeOptimization.update).toHaveBeenCalledWith({
      where: { id: 'opt-1' },
      data: { status: 'FAILED' },
    });
  });

  it('findAllByUserId() excludes soft-deleted rows and orders most-recent-first', async () => {
    const { prisma, resumeOptimization } = buildPrismaMock();
    const repository = new ResumeOptimizationRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(resumeOptimization.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { suggestions: { where: { deletedAt: null }, orderBy: { displayOrder: 'asc' } } },
    });
  });

  it('findById() excludes soft-deleted rows', async () => {
    const { prisma, resumeOptimization } = buildPrismaMock();
    const repository = new ResumeOptimizationRepository(prisma);

    await repository.findById('opt-1');

    expect(resumeOptimization.findFirst).toHaveBeenCalledWith({
      where: { id: 'opt-1', deletedAt: null },
      include: { suggestions: { where: { deletedAt: null }, orderBy: { displayOrder: 'asc' } } },
    });
  });

  it('softDelete() sets deletedAt', async () => {
    const { prisma, resumeOptimization } = buildPrismaMock();
    const repository = new ResumeOptimizationRepository(prisma);

    await repository.softDelete('opt-1');

    expect(resumeOptimization.update).toHaveBeenCalledWith({
      where: { id: 'opt-1' },
      data: { deletedAt: expect.any(Date) },
    });
  });

  describe('markApplyOutcome', () => {
    it('marks applied suggestions accepted+applied and skipped ones accepted-only, inside the given tx', async () => {
      const { prisma, optimizationSuggestion } = buildPrismaMock();
      const repository = new ResumeOptimizationRepository(prisma);
      const tx = { optimizationSuggestion } as unknown as Prisma.TransactionClient;

      await repository.markApplyOutcome(tx, ['s1', 's2'], ['s3']);

      expect(optimizationSuggestion.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['s1', 's2'] } },
        data: { accepted: true, applied: true },
      });
      expect(optimizationSuggestion.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['s3'] } },
        data: { accepted: true, applied: false },
      });
    });

    it('skips the updateMany call entirely for an empty id list', async () => {
      const { prisma, optimizationSuggestion } = buildPrismaMock();
      const repository = new ResumeOptimizationRepository(prisma);
      const tx = { optimizationSuggestion } as unknown as Prisma.TransactionClient;

      await repository.markApplyOutcome(tx, [], []);

      expect(optimizationSuggestion.updateMany).not.toHaveBeenCalled();
    });
  });
});
