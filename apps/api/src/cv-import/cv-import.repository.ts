import { Injectable } from '@nestjs/common';
import type { CvFileType, CvImport, CvImportStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CvFieldConfidence, ExtractedCvData } from './interfaces/extracted-cv-data.interface';

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
    return this.prisma.cvImport.update({ where: { id }, data });
  }

  softDelete(id: string): Promise<CvImport> {
    return this.prisma.cvImport.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
