import { ResumeCompletionService } from './resume-completion.service';
import type { PrismaService } from '../prisma/prisma.service';

function buildPrismaMock(overrides: {
  resume?: any;
  profile?: any;
  workExperienceCount?: number;
  educationCount?: number;
  skillCount?: number;
  languageCount?: number;
}) {
  return {
    masterResume: {
      findFirst: jest.fn().mockResolvedValue(overrides.resume ?? null),
      update: jest.fn(),
    },
    profile: {
      findFirst: jest.fn().mockResolvedValue(overrides.profile ?? null),
    },
    workExperience: { count: jest.fn().mockResolvedValue(overrides.workExperienceCount ?? 0) },
    education: { count: jest.fn().mockResolvedValue(overrides.educationCount ?? 0) },
    skill: { count: jest.fn().mockResolvedValue(overrides.skillCount ?? 0) },
    language: { count: jest.fn().mockResolvedValue(overrides.languageCount ?? 0) },
  } as unknown as jest.Mocked<PrismaService>;
}

describe('ResumeCompletionService', () => {
  it('returns null when the user has no master resume yet', async () => {
    const prisma = buildPrismaMock({ resume: null });
    const service = new ResumeCompletionService(prisma);

    const result = await service.recalculate('user-1');

    expect(result).toBeNull();
  });

  it('computes 0% for a bare resume with nothing filled in', async () => {
    const prisma = buildPrismaMock({
      resume: { id: 'resume-1', summary: null, completionPercentage: 0 },
    });
    const service = new ResumeCompletionService(prisma);

    const result = await service.recalculate('user-1');

    expect(result).toBe(0);
    expect(prisma.masterResume.update).not.toHaveBeenCalled(); // no change from 0 -> 0
  });

  it('computes 100% when every contributing field/section is present', async () => {
    const prisma = buildPrismaMock({
      resume: { id: 'resume-1', summary: 'A great summary', completionPercentage: 0 },
      profile: {
        firstName: 'Jane',
        lastName: 'Doe',
        photoUrl: 'https://example.com/photo.jpg',
        linkedin: 'https://linkedin.com/in/jane',
        portfolio: 'https://jane.dev',
      },
      workExperienceCount: 1,
      educationCount: 1,
      skillCount: 3,
      languageCount: 1,
    });
    const service = new ResumeCompletionService(prisma);

    const result = await service.recalculate('user-1');

    expect(result).toBe(100);
    expect(prisma.masterResume.update).toHaveBeenCalledWith({
      where: { id: 'resume-1' },
      data: { completionPercentage: 100 },
    });
  });

  it('computes a partial percentage matching the count of satisfied checks out of 9', async () => {
    // Personal info + Experience + Summary = 3 of 9 checks -> 33%
    const prisma = buildPrismaMock({
      resume: { id: 'resume-1', summary: 'Summary present', completionPercentage: 0 },
      profile: { firstName: 'Jane', lastName: 'Doe' },
      workExperienceCount: 1,
    });
    const service = new ResumeCompletionService(prisma);

    const result = await service.recalculate('user-1');

    expect(result).toBe(Math.round((3 / 9) * 100));
  });

  it('skips the write when the recalculated percentage is unchanged', async () => {
    const prisma = buildPrismaMock({
      resume: { id: 'resume-1', summary: null, completionPercentage: 0 },
    });
    const service = new ResumeCompletionService(prisma);

    await service.recalculate('user-1');

    expect(prisma.masterResume.update).not.toHaveBeenCalled();
  });
});
