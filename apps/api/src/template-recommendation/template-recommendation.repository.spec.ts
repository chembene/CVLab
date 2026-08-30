import { TemplateRecommendationRepository } from './template-recommendation.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('TemplateRecommendationRepository', () => {
  function buildPrismaMock() {
    const templateRecommendation = {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    };
    const prisma = { templateRecommendation } as unknown as jest.Mocked<PrismaService>;
    return { prisma, templateRecommendation };
  }

  const data = {
    resumeVariantId: 'variant-1',
    jobTargetId: 'jt-1',
    summary: 'Summary.',
    recommendations: [{ templateId: 'tpl-1', rank: 1, score: 82, reason: 'Reason.' }],
    contextSnapshot: {
      hasMasterResume: true,
      hasResumeVariant: true,
      hasJobTarget: true,
      workExperienceCount: 1,
      educationCount: 0,
      skillsCount: 2,
      availableTemplatesCount: 10,
    },
    creditsUsed: 20,
    aiRequestId: 'ai-req-1',
  };

  it('create() writes every provided field, serializing Json fields', async () => {
    const { prisma, templateRecommendation } = buildPrismaMock();
    const repository = new TemplateRecommendationRepository(prisma);

    await repository.create('user-1', data);

    expect(templateRecommendation.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', ...data },
    });
  });

  it('findAllByUserId() orders most-recent-first', async () => {
    const { prisma, templateRecommendation } = buildPrismaMock();
    const repository = new TemplateRecommendationRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(templateRecommendation.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findById() looks up by primary key', async () => {
    const { prisma, templateRecommendation } = buildPrismaMock();
    const repository = new TemplateRecommendationRepository(prisma);

    await repository.findById('rec-1');

    expect(templateRecommendation.findUnique).toHaveBeenCalledWith({ where: { id: 'rec-1' } });
  });
});
