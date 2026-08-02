import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cross-cutting completion-percentage calculator. Reads across
 * Profile/MasterResume/WorkExperience/Education/Skill/Language — the same
 * "reads from all modules" pattern already established for
 * History/Analytics in docs/architecture/module-boundaries.md — and is the
 * one place completionPercentage is ever written. Profile/MasterResume/
 * ResumeSections services call `recalculate(userId)` after their own
 * mutations; never accepted as client input.
 */
@Injectable()
export class ResumeCompletionService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(userId: string): Promise<number | null> {
    const resume = await this.prisma.masterResume.findFirst({ where: { userId, deletedAt: null } });
    if (!resume) {
      return null;
    }

    const [profile, workExperienceCount, educationCount, skillCount, languageCount] =
      await Promise.all([
        this.prisma.profile.findFirst({ where: { userId, deletedAt: null } }),
        this.prisma.workExperience.count({ where: { resumeId: resume.id, deletedAt: null } }),
        this.prisma.education.count({ where: { resumeId: resume.id, deletedAt: null } }),
        this.prisma.skill.count({ where: { resumeId: resume.id, deletedAt: null } }),
        this.prisma.language.count({ where: { resumeId: resume.id, deletedAt: null } }),
      ]);

    const checks = [
      Boolean(profile?.firstName && profile?.lastName), // Personal Info
      workExperienceCount > 0, // Experience
      educationCount > 0, // Education
      skillCount > 0, // Skills
      languageCount > 0, // Languages
      Boolean(profile?.photoUrl), // Photo
      Boolean(resume.summary), // Summary
      Boolean(profile?.linkedin), // LinkedIn
      Boolean(profile?.portfolio), // Portfolio
    ];

    const percentage = Math.round((checks.filter(Boolean).length / checks.length) * 100);

    if (percentage !== resume.completionPercentage) {
      await this.prisma.masterResume.update({
        where: { id: resume.id },
        data: { completionPercentage: percentage },
      });
    }

    return percentage;
  }
}
