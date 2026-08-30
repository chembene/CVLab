import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ResumeVariantVersion,
  ResumeVersionLabel,
  ResumeVersionSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateResumeVersionData {
  resumeVariantId: string;
  versionNumber: number;
  content: Prisma.InputJsonValue;
  label: ResumeVersionLabel;
  customLabel?: string;
  source: ResumeVersionSource;
  createdByUserId: string;
  jobTargetId?: string;
  coverLetterId?: string;
  notes?: string;
  changeSummary?: string;
}

/**
 * Only Prisma access for `resume_variant_versions` lives here. Read
 * methods filter through the `resumeVariant` relation to enforce ownership
 * in one query — this module deliberately never imports ResumeVariantModule
 * (see docs/architecture/resume-version-history.md "Module Boundaries"), so
 * this is how it verifies a variant belongs to the requesting user without
 * ResumeVariantService.
 */
@Injectable()
export class ResumeVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateResumeVersionData): Promise<ResumeVariantVersion> {
    return this.prisma.resumeVariantVersion.create({ data });
  }

  findAllByVariantId(variantId: string, ownerUserId: string): Promise<ResumeVariantVersion[]> {
    return this.prisma.resumeVariantVersion.findMany({
      where: {
        resumeVariantId: variantId,
        resumeVariant: { userId: ownerUserId, deletedAt: null },
      },
      orderBy: { versionNumber: 'desc' },
    });
  }

  findOneByVariantAndNumber(
    variantId: string,
    versionNumber: number,
    ownerUserId: string,
  ): Promise<ResumeVariantVersion | null> {
    return this.prisma.resumeVariantVersion.findFirst({
      where: {
        resumeVariantId: variantId,
        versionNumber,
        resumeVariant: { userId: ownerUserId, deletedAt: null },
      },
    });
  }

  /** Export Engine — resolves a caller-supplied `resumeVariantVersionId` (a row id, not a versionNumber), verifying in one query both that it belongs to `variantId` and that the owning ResumeVariant belongs to `ownerUserId`. Never returns a version from a different Variant, even one the same owner owns. */
  findByIdWithinVariant(
    id: string,
    variantId: string,
    ownerUserId: string,
  ): Promise<ResumeVariantVersion | null> {
    return this.prisma.resumeVariantVersion.findFirst({
      where: {
        id,
        resumeVariantId: variantId,
        resumeVariant: { userId: ownerUserId, deletedAt: null },
      },
    });
  }

  /** Unfiltered by owner — used internally by ResumeVariantService, which has already checked ownership itself. */
  findLatestByVariantId(variantId: string): Promise<ResumeVariantVersion | null> {
    return this.prisma.resumeVariantVersion.findFirst({
      where: { resumeVariantId: variantId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  /** Unfiltered by owner — same rationale as findLatestByVariantId. */
  findOneByVariantAndNumberUnfiltered(
    variantId: string,
    versionNumber: number,
  ): Promise<ResumeVariantVersion | null> {
    return this.prisma.resumeVariantVersion.findFirst({
      where: { resumeVariantId: variantId, versionNumber },
    });
  }
}
