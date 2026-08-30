import { Injectable } from '@nestjs/common';
import type { Prisma, ResumeVariant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResumeVariantData {
  title?: string;
  jobTargetId?: string;
  status?: string;
  archived?: boolean;
  completionPercentage?: number;
  content?: Prisma.InputJsonValue;
  // Phase 11 Template Engine — presentation-only fields, never touched by
  // applyEdit()'s content-versioning path (see resume-variant.service.ts's
  // setTemplate()/updateTheme(), which both go through plain update()).
  templateId?: string | null;
  themeOverrides?: Prisma.InputJsonValue | typeof Prisma.DbNull;
}

/** Only Prisma access for the `resume_variants` table lives here. */
@Injectable()
export class ResumeVariantRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByUserId(userId: string): Promise<ResumeVariant[]> {
    return this.prisma.resumeVariant.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<ResumeVariant | null> {
    return this.prisma.resumeVariant.findFirst({ where: { id, deletedAt: null } });
  }

  create(
    userId: string,
    masterResumeId: string,
    data: ResumeVariantData & {
      title: string;
      content: Prisma.InputJsonValue;
      completionPercentage: number;
    },
  ): Promise<ResumeVariant> {
    return this.prisma.resumeVariant.create({ data: { userId, masterResumeId, ...data } });
  }

  /** Plain field update — used for state transitions (archive/restore) that are not content edits, so no version bump. */
  update(id: string, data: ResumeVariantData): Promise<ResumeVariant> {
    return this.prisma.resumeVariant.update({ where: { id }, data });
  }

  /**
   * Content edit — bumps the version counter. Used by the PUT
   * /resume-variants/:id flow, never by archive/restore. Accepts an
   * optional transaction client (defaulting to the regular PrismaService)
   * so ResumeOptimizationService.apply() can write the content change and
   * OptimizationSuggestion.applied flags atomically — see
   * docs/architecture/resume-optimization.md "Apply Engine".
   */
  applyEdit(
    id: string,
    data: ResumeVariantData,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ResumeVariant> {
    return client.resumeVariant.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
  }

  softDelete(id: string): Promise<ResumeVariant> {
    return this.prisma.resumeVariant.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
