import { Injectable } from '@nestjs/common';
import type { AtsReport } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AtsReportData {
  overallScore: number;
  keywordScore: number;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  languageScore: number;
  formattingScore: number;
  completionScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  recommendedSkills: string[];
  recommendations: string[];
}

/** Only Prisma access for the `ats_reports` table lives here. No `update()` — reports are never overwritten, only created and (optionally) deleted. */
@Injectable()
export class AtsReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByUserId(userId: string): Promise<AtsReport[]> {
    return this.prisma.atsReport.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  findById(id: string): Promise<AtsReport | null> {
    return this.prisma.atsReport.findUnique({ where: { id } });
  }

  /** Most recent report for one Resume Variant — used by ResumeOptimizationService to reuse a "before" baseline instead of always re-running ATS (see the `force` input flag). */
  findLatestByVariantId(resumeVariantId: string): Promise<AtsReport | null> {
    return this.prisma.atsReport.findFirst({
      where: { resumeVariantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(
    userId: string,
    resumeVariantId: string,
    jobTargetId: string,
    data: AtsReportData,
  ): Promise<AtsReport> {
    return this.prisma.atsReport.create({
      data: { userId, resumeVariantId, jobTargetId, ...data },
    });
  }

  /** A real, physical delete — see the AtsReport model comment in schema.prisma for why this table has no `deletedAt`. */
  delete(id: string): Promise<AtsReport> {
    return this.prisma.atsReport.delete({ where: { id } });
  }
}
