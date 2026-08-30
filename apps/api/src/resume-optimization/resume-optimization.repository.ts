import { Injectable } from '@nestjs/common';
import type {
  OptimizationSuggestion,
  Prisma,
  ResumeOptimization,
  SuggestionPriority,
  SuggestionType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateOptimizationData {
  resumeVariantId: string;
  jobTargetId: string;
  atsReportId: string;
  beforeScore: number;
}

export interface CreateSuggestionData {
  type: SuggestionType;
  section: string;
  title: string;
  description?: string;
  reason: string;
  priority: SuggestionPriority;
  originalText: string;
  suggestedText: string;
  displayOrder: number;
}

export interface CompleteOptimizationData {
  creditsUsed: number;
  predictedScore: number;
  summary: string;
  suggestions: CreateSuggestionData[];
}

export interface OptimizationWithSuggestions extends ResumeOptimization {
  suggestions: OptimizationSuggestion[];
}

const SUGGESTIONS_INCLUDE = {
  suggestions: { where: { deletedAt: null }, orderBy: { displayOrder: 'asc' as const } },
} satisfies Prisma.ResumeOptimizationInclude;

/** Only Prisma access for `resume_optimizations` and `optimization_suggestions` lives here. */
@Injectable()
export class ResumeOptimizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the PENDING row before the AI call — status is real state here (not a placeholder), so 'started'/'completed'/'failed' history events all reference one genuine, stable entity id. */
  create(userId: string, data: CreateOptimizationData): Promise<ResumeOptimization> {
    return this.prisma.resumeOptimization.create({ data: { userId, ...data } });
  }

  /** Finalizes a PENDING row into COMPLETED and creates its suggestions in one write — called only after the AI response has been fully parsed and validated. */
  completeWithSuggestions(
    id: string,
    data: CompleteOptimizationData,
  ): Promise<OptimizationWithSuggestions> {
    const { suggestions, ...rest } = data;
    return this.prisma.resumeOptimization.update({
      where: { id },
      data: { status: 'COMPLETED', ...rest, suggestions: { createMany: { data: suggestions } } },
      include: SUGGESTIONS_INCLUDE,
    });
  }

  markFailed(id: string): Promise<ResumeOptimization> {
    return this.prisma.resumeOptimization.update({ where: { id }, data: { status: 'FAILED' } });
  }

  findAllByUserId(userId: string): Promise<OptimizationWithSuggestions[]> {
    return this.prisma.resumeOptimization.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: SUGGESTIONS_INCLUDE,
    });
  }

  findById(id: string): Promise<OptimizationWithSuggestions | null> {
    return this.prisma.resumeOptimization.findFirst({
      where: { id, deletedAt: null },
      include: SUGGESTIONS_INCLUDE,
    });
  }

  softDelete(id: string): Promise<ResumeOptimization> {
    return this.prisma.resumeOptimization.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Marks the outcome of one apply() call: `appliedIds` were accepted AND
   * successfully written into the resume variant's content; `skippedIds`
   * were accepted by the user but targeted a section ResumeSuggestionApplier
   * doesn't recognize, so they stay accepted without being applied. Must run
   * inside the same `tx` as the resume variant's content write — see
   * ResumeOptimizationService.apply().
   */
  async markApplyOutcome(
    tx: Prisma.TransactionClient,
    appliedIds: string[],
    skippedIds: string[],
  ): Promise<void> {
    if (appliedIds.length > 0) {
      await tx.optimizationSuggestion.updateMany({
        where: { id: { in: appliedIds } },
        data: { accepted: true, applied: true },
      });
    }
    if (skippedIds.length > 0) {
      await tx.optimizationSuggestion.updateMany({
        where: { id: { in: skippedIds } },
        data: { accepted: true, applied: false },
      });
    }
  }
}
