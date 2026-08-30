import { Injectable } from '@nestjs/common';
import type { CoverLetterTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CoverLetterTemplateFilters {
  category?: CoverLetterTemplate['category'];
  atsFriendly?: boolean;
  premium?: boolean;
}

/** Only Prisma access for `cover_letter_templates` — same read-only-catalog rationale as ResumeTemplateRepository. */
@Injectable()
export class CoverLetterTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: CoverLetterTemplateFilters): Promise<CoverLetterTemplate[]> {
    const where: Prisma.CoverLetterTemplateWhereInput = {
      status: 'ACTIVE',
      ...(filters.category ? { category: filters.category } : {}),
      ...(filters.atsFriendly !== undefined ? { isATSFriendly: filters.atsFriendly } : {}),
      ...(filters.premium !== undefined ? { premium: filters.premium } : {}),
    };
    return this.prisma.coverLetterTemplate.findMany({ where, orderBy: { name: 'asc' } });
  }

  findById(id: string): Promise<CoverLetterTemplate | null> {
    return this.prisma.coverLetterTemplate.findFirst({ where: { id, status: 'ACTIVE' } });
  }

  findByIdUnfiltered(id: string): Promise<CoverLetterTemplate | null> {
    return this.prisma.coverLetterTemplate.findUnique({ where: { id } });
  }

  /** "Recently used" — derived from cover_letters.template_id + updated_at, same rationale as ResumeTemplateRepository.findRecentlyUsedByUserId(). */
  async findRecentlyUsedByUserId(userId: string, limit: number): Promise<CoverLetterTemplate[]> {
    const letters = await this.prisma.coverLetter.findMany({
      where: { userId, templateId: { not: null }, deletedAt: null },
      distinct: ['templateId'],
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: { template: true },
    });
    return letters.flatMap((l) => (l.template ? [l.template] : []));
  }
}
