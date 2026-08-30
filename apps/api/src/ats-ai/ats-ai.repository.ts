import { Injectable } from '@nestjs/common';
import type { AtsAiAnalysis, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AtsAiContextSnapshot,
  AtsAiRecommendation,
} from './interfaces/ats-ai-context.interface';

export interface CreateAtsAiAnalysisData {
  atsReportId: string;
  overallAssessment: string;
  strengths: string[];
  priorityIssues: AtsAiRecommendation[];
  contentRecommendations: AtsAiRecommendation[];
  sectionRecommendations: AtsAiRecommendation[];
  actionPlan: string[];
  contextSnapshot: AtsAiContextSnapshot;
  creditsUsed: number;
  aiRequestId: string;
}

/** Only Prisma access for the `ats_ai_analyses` table lives here. */
@Injectable()
export class AtsAiRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: CreateAtsAiAnalysisData): Promise<AtsAiAnalysis> {
    return this.prisma.atsAiAnalysis.create({
      data: {
        userId,
        ...data,
        priorityIssues: data.priorityIssues as unknown as Prisma.InputJsonValue,
        contentRecommendations: data.contentRecommendations as unknown as Prisma.InputJsonValue,
        sectionRecommendations: data.sectionRecommendations as unknown as Prisma.InputJsonValue,
        contextSnapshot: data.contextSnapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  findAllByUserId(userId: string): Promise<AtsAiAnalysis[]> {
    return this.prisma.atsAiAnalysis.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<AtsAiAnalysis | null> {
    return this.prisma.atsAiAnalysis.findUnique({ where: { id } });
  }
}
