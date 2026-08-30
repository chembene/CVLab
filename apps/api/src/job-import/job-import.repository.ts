import { Injectable } from '@nestjs/common';
import type { JobImportMetadata, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ParsedJobData, JobFieldConfidence } from './interfaces/job-parser.interface';

export interface CreateJobImportMetadataData {
  jobTargetId: string;
  sourceUrl: string;
  provider: string;
  rawHtml: string;
  cleanedDescription: string;
  companyLogoUrl?: string;
  extractedData: ParsedJobData;
  fieldConfidence: JobFieldConfidence;
  overallConfidence: number;
  extractedAt: Date;
  /** Set when this row's data was copied from a prior import of the same sourceUrl (rule 13) rather than freshly fetched — see JobImportService.importFromUrl. */
  duplicateOfId?: string;
}

/** Only Prisma access for `job_import_metadata` lives here. */
@Injectable()
export class JobImportRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateJobImportMetadataData): Promise<JobImportMetadata> {
    return this.prisma.jobImportMetadata.create({
      data: {
        ...data,
        extractedData: data.extractedData as unknown as Prisma.InputJsonValue,
        fieldConfidence: data.fieldConfidence as unknown as Prisma.InputJsonValue,
      },
    });
  }

  findByJobTargetId(jobTargetId: string): Promise<JobImportMetadata | null> {
    return this.prisma.jobImportMetadata.findUnique({ where: { jobTargetId } });
  }

  /** Most recent prior import of this exact URL, if any — the source JobImportService.importFromUrl() reuses instead of re-fetching/re-parsing (rule 13). */
  findLatestBySourceUrl(sourceUrl: string): Promise<JobImportMetadata | null> {
    return this.prisma.jobImportMetadata.findFirst({
      where: { sourceUrl },
      orderBy: { createdAt: 'desc' },
    });
  }
}
