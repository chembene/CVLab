import { Injectable } from '@nestjs/common';
import type { Prisma, ResumeTemplate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResumeTemplateFilters {
  category?: ResumeTemplate['category'];
  atsFriendly?: boolean;
  premium?: boolean;
}

/** Only Prisma access for `resume_templates` lives here — the catalog is read-only from the API's perspective (rows are seeded, never created/edited via HTTP, see prisma/seed-templates.ts). */
@Injectable()
export class ResumeTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: ResumeTemplateFilters): Promise<ResumeTemplate[]> {
    const where: Prisma.ResumeTemplateWhereInput = {
      status: 'ACTIVE',
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.atsFriendly !== undefined ? { isATSFriendly: filters.atsFriendly } : {}),
      ...(filters.premium !== undefined ? { premium: filters.premium } : {}),
    };
    return this.prisma.resumeTemplate.findMany({ where, orderBy: { name: 'asc' } });
  }

  findById(id: string): Promise<ResumeTemplate | null> {
    return this.prisma.resumeTemplate.findFirst({ where: { id, status: 'ACTIVE' } });
  }

  /** Unfiltered by status — used to validate a templateId a caller wants to assign to a Resume Variant, even if (for some future reason) it's DRAFT/ARCHIVED, so the error message can be specific ("this template is archived") instead of a generic 404. */
  findByIdUnfiltered(id: string): Promise<ResumeTemplate | null> {
    return this.prisma.resumeTemplate.findUnique({ where: { id } });
  }

  /**
   * "Recently used" (Part 7) — derived from resume_variants.template_id +
   * updated_at, deliberately not its own table (see the ResumeTemplateFavorite
   * doc-comment in schema.prisma). `distinct: ['templateId']` + matching
   * `orderBy` gives one row per template, most-recently-touched first —
   * Postgres DISTINCT ON semantics via Prisma's distinct API.
   */
  async findRecentlyUsedByUserId(userId: string, limit: number): Promise<ResumeTemplate[]> {
    const variants = await this.prisma.resumeVariant.findMany({
      where: { userId, templateId: { not: null }, deletedAt: null },
      distinct: ['templateId'],
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { template: true },
    });
    return variants.flatMap((v) => (v.template ? [v.template] : []));
  }
}
