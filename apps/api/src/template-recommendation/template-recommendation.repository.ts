import { Injectable } from '@nestjs/common';
import type { Prisma, TemplateRecommendation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  TemplateRecommendationContextSnapshot,
  TemplateRecommendationItem,
} from './interfaces/template-recommendation-context.interface';

export interface CreateTemplateRecommendationData {
  resumeVariantId?: string;
  jobTargetId?: string;
  summary: string;
  recommendations: TemplateRecommendationItem[];
  contextSnapshot: TemplateRecommendationContextSnapshot;
  creditsUsed: number;
  aiRequestId: string;
}

/** Only Prisma access for the `template_recommendations` table lives here. */
@Injectable()
export class TemplateRecommendationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: CreateTemplateRecommendationData): Promise<TemplateRecommendation> {
    return this.prisma.templateRecommendation.create({
      data: {
        userId,
        ...data,
        recommendations: data.recommendations as unknown as Prisma.InputJsonValue,
        contextSnapshot: data.contextSnapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  findAllByUserId(userId: string): Promise<TemplateRecommendation[]> {
    return this.prisma.templateRecommendation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<TemplateRecommendation | null> {
    return this.prisma.templateRecommendation.findUnique({ where: { id } });
  }
}
