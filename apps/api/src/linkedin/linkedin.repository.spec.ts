import { LinkedInRepository } from './linkedin.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('LinkedInRepository', () => {
  function buildPrismaMock() {
    const linkedInProfile = { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() };
    const prisma = { linkedInProfile } as unknown as jest.Mocked<PrismaService>;
    return { prisma, linkedInProfile };
  }

  const data = {
    targetRole: 'Staff Engineer',
    headline: 'Senior Backend Engineer',
    about: 'About section.',
    skills: ['TypeScript'],
    experienceSuggestions: ['Suggestion.'],
    recommendations: ['Recommendation.'],
    contextSnapshot: {
      hasProfile: true,
      hasMasterResume: true,
      workExperienceCount: 1,
      educationCount: 0,
      skillsCount: 2,
      jobTargetsCount: 0,
    },
    creditsUsed: 30,
    aiRequestId: 'ai-req-1',
  };

  it('create() writes every provided field, serializing contextSnapshot as JSON', async () => {
    const { prisma, linkedInProfile } = buildPrismaMock();
    const repository = new LinkedInRepository(prisma);

    await repository.create('user-1', data);

    expect(linkedInProfile.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', ...data },
    });
  });

  it('findAllByUserId() orders most-recent-first', async () => {
    const { prisma, linkedInProfile } = buildPrismaMock();
    const repository = new LinkedInRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(linkedInProfile.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findById() looks up by primary key', async () => {
    const { prisma, linkedInProfile } = buildPrismaMock();
    const repository = new LinkedInRepository(prisma);

    await repository.findById('lp-1');

    expect(linkedInProfile.findUnique).toHaveBeenCalledWith({ where: { id: 'lp-1' } });
  });
});
