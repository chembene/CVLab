import { Injectable } from '@nestjs/common';
import type { CoverLetter, CoverLetterStatus, CoverLetterTone, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateCoverLetterData {
  resumeVariantId: string;
  jobTargetId: string;
  optimizationId?: string;
  title: string;
  content: string;
  tone: CoverLetterTone;
  language: string;
  version: number;
  status: CoverLetterStatus;
  creditsUsed: number;
  generatedByAI: boolean;
}

export interface UpdateCoverLetterData {
  title?: string;
  content?: string;
  tone?: CoverLetterTone;
  language?: string;
  status?: CoverLetterStatus;
  // Phase 11 Template Engine — presentation-only, see ResumeVariantData's
  // identical fields for the full rationale.
  templateId?: string | null;
  themeOverrides?: Prisma.InputJsonValue | typeof Prisma.DbNull;
}

/** Only Prisma access for the `cover_letters` table lives here. */
@Injectable()
export class CoverLetterRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: CreateCoverLetterData): Promise<CoverLetter> {
    return this.prisma.coverLetter.create({ data: { userId, ...data } });
  }

  findAllByUserId(userId: string): Promise<CoverLetter[]> {
    return this.prisma.coverLetter.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<CoverLetter | null> {
    return this.prisma.coverLetter.findFirst({ where: { id, deletedAt: null } });
  }

  /** Plain field update — manual edits (PUT), archive, and restore all go through this; none of them bump `version`, per docs/architecture/cover-letter-engine.md "Versioning". */
  update(id: string, data: UpdateCoverLetterData): Promise<CoverLetter> {
    return this.prisma.coverLetter.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<CoverLetter> {
    return this.prisma.coverLetter.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
