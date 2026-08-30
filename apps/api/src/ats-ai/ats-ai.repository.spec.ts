import { AtsAiRepository } from './ats-ai.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('AtsAiRepository', () => {
  function buildPrismaMock() {
    const atsAiAnalysis = { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() };
    const prisma = { atsAiAnalysis } as unknown as jest.Mocked<PrismaService>;
    return { prisma, atsAiAnalysis };
  }

  const recommendation = {
    priority: 'HIGH' as const,
    category: 'Keywords',
    explanation: 'Explanation.',
    recommendation: 'Recommendation.',
  };

  const data = {
    atsReportId: 'report-1',
    overallAssessment: 'Assessment.',
    strengths: ['Strength'],
    priorityIssues: [recommendation],
    contentRecommendations: [recommendation],
    sectionRecommendations: [recommendation],
    actionPlan: ['Step 1'],
    contextSnapshot: {
      matchedKeywordsCount: 1,
      missingKeywordsCount: 1,
      recommendedSkillsCount: 1,
    },
    creditsUsed: 30,
    aiRequestId: 'ai-req-1',
  };

  it('create() writes every provided field, serializing Json fields', async () => {
    const { prisma, atsAiAnalysis } = buildPrismaMock();
    const repository = new AtsAiRepository(prisma);

    await repository.create('user-1', data);

    expect(atsAiAnalysis.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', ...data },
    });
  });

  it('findAllByUserId() orders most-recent-first', async () => {
    const { prisma, atsAiAnalysis } = buildPrismaMock();
    const repository = new AtsAiRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(atsAiAnalysis.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findById() looks up by primary key', async () => {
    const { prisma, atsAiAnalysis } = buildPrismaMock();
    const repository = new AtsAiRepository(prisma);

    await repository.findById('analysis-1');

    expect(atsAiAnalysis.findUnique).toHaveBeenCalledWith({ where: { id: 'analysis-1' } });
  });
});
