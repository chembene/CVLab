import { Injectable } from '@nestjs/common';
import type { CareerAdvice, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CareerAdviceContextSnapshot } from './interfaces/career-advice-context.interface';

export interface CreateCareerAdviceData {
  question: string;
  summary: string;
  currentAssessment: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  nextSteps: string[];
  contextSnapshot: CareerAdviceContextSnapshot;
  creditsUsed: number;
  aiRequestId: string;
}

/** Only Prisma access for the `career_advice` table lives here. */
@Injectable()
export class CareerAdvisorRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: CreateCareerAdviceData): Promise<CareerAdvice> {
    return this.prisma.careerAdvice.create({
      data: {
        userId,
        ...data,
        contextSnapshot: data.contextSnapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  findAllByUserId(userId: string): Promise<CareerAdvice[]> {
    return this.prisma.careerAdvice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<CareerAdvice | null> {
    return this.prisma.careerAdvice.findUnique({ where: { id } });
  }
}
