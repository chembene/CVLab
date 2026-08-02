import { AtsReportRepository } from './ats-report.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('AtsReportRepository', () => {
  function buildPrismaMock() {
    const atsReport = {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    };
    const prisma = { atsReport } as unknown as jest.Mocked<PrismaService>;
    return { prisma, atsReport };
  }

  it('create() writes all provided score/keyword/recommendation fields', async () => {
    const { prisma, atsReport } = buildPrismaMock();
    const repository = new AtsReportRepository(prisma);
    const data = {
      overallScore: 80,
      keywordScore: 70,
      skillsScore: 90,
      experienceScore: 100,
      educationScore: 100,
      languageScore: 100,
      formattingScore: 80,
      completionScore: 60,
      matchedKeywords: ['a'],
      missingKeywords: ['b'],
      recommendedSkills: ['c'],
      recommendations: ['d'],
    };

    await repository.create('user-1', 'rv-1', 'jt-1', data);

    expect(atsReport.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', resumeVariantId: 'rv-1', jobTargetId: 'jt-1', ...data },
    });
  });

  it('delete() performs a real, physical delete (no deletedAt column exists)', async () => {
    const { prisma, atsReport } = buildPrismaMock();
    const repository = new AtsReportRepository(prisma);

    await repository.delete('report-1');

    expect(atsReport.delete).toHaveBeenCalledWith({ where: { id: 'report-1' } });
  });

  it('findAllByUserId() orders by most recent first', async () => {
    const { prisma, atsReport } = buildPrismaMock();
    const repository = new AtsReportRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(atsReport.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });
});
