import { CareerAdvisorRepository } from './career-advisor.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('CareerAdvisorRepository', () => {
  function buildPrismaMock() {
    const careerAdvice = { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() };
    const prisma = { careerAdvice } as unknown as jest.Mocked<PrismaService>;
    return { prisma, careerAdvice };
  }

  const data = {
    question: 'What should I focus on next?',
    summary: 'Summary.',
    currentAssessment: 'Assessment.',
    strengths: ['Strength'],
    gaps: ['Gap'],
    recommendations: ['Recommendation'],
    nextSteps: ['Next step'],
    contextSnapshot: {
      hasProfile: true,
      hasMasterResume: true,
      workExperienceCount: 1,
      educationCount: 0,
      skillsCount: 2,
      jobTargetsCount: 0,
      resumeVariantsCount: 0,
      applicationsCount: 0,
      atsReportsCount: 0,
      interviewSessionsCount: 0,
    },
    creditsUsed: 30,
    aiRequestId: 'ai-req-1',
  };

  it('create() writes every provided field, serializing contextSnapshot as JSON', async () => {
    const { prisma, careerAdvice } = buildPrismaMock();
    const repository = new CareerAdvisorRepository(prisma);

    await repository.create('user-1', data);

    expect(careerAdvice.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', ...data },
    });
  });

  it('findAllByUserId() orders most-recent-first', async () => {
    const { prisma, careerAdvice } = buildPrismaMock();
    const repository = new CareerAdvisorRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(careerAdvice.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findById() looks up by primary key', async () => {
    const { prisma, careerAdvice } = buildPrismaMock();
    const repository = new CareerAdvisorRepository(prisma);

    await repository.findById('ca-1');

    expect(careerAdvice.findUnique).toHaveBeenCalledWith({ where: { id: 'ca-1' } });
  });
});
