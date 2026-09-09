import { Injectable } from '@nestjs/common';
import type { CvFileType, CvImport, CvImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CvFieldConfidence, ExtractedCvData } from './interfaces/extracted-cv-data.interface';
import type { CvImportAiSuggestion } from './interfaces/cv-import-ai.interface';

export interface CreateCvImportData {
  fileName: string;
  fileType: CvFileType;
  fileSizeBytes: number;
  status: CvImportStatus;
  rawTextExcerpt?: string;
  extractedData?: ExtractedCvData;
  fieldConfidence?: CvFieldConfidence;
  creditsUsed: number;
}

export interface UpdateCvImportData {
  status?: CvImportStatus;
  masterResumeId?: string;
  errorMessage?: string;
  /** FASE 22 — CV Import AI. Set together by CvImportService.enhanceWithAi(); never touched by the deterministic upload()/confirm() flow. */
  aiSuggestions?: CvImportAiSuggestion[];
  aiUnresolvedFields?: string[];
  aiRequestId?: string;
  creditsUsed?: number;
}

/** Only Prisma access for the `cv_imports` table lives here. */
@Injectable()
export class CvImportRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, data: CreateCvImportData): Promise<CvImport> {
    return this.prisma.cvImport.create({
      data: {
        userId,
        ...data,
        extractedData: data.extractedData as unknown as Prisma.InputJsonValue,
        fieldConfidence: data.fieldConfidence as unknown as Prisma.InputJsonValue,
      },
    });
  }

  findAllByUserId(userId: string): Promise<CvImport[]> {
    return this.prisma.cvImport.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<CvImport | null> {
    return this.prisma.cvImport.findFirst({ where: { id, deletedAt: null } });
  }

  update(id: string, data: UpdateCvImportData): Promise<CvImport> {
    return this.prisma.cvImport.update({
      where: { id },
      data: {
        ...data,
        aiSuggestions: data.aiSuggestions as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  softDelete(id: string): Promise<CvImport> {
    return this.prisma.cvImport.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
