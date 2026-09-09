import { CvImportRepository } from './cv-import.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('CvImportRepository', () => {
  function buildPrismaMock() {
    const cvImport = {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    };
    const prisma = { cvImport } as unknown as jest.Mocked<PrismaService>;
    return { prisma, cvImport };
  }

  it('create() writes every provided field, serializing Json fields', async () => {
    const { prisma, cvImport } = buildPrismaMock();
    const repository = new CvImportRepository(prisma);
    const data = {
      fileName: 'cv.pdf',
      fileType: 'PDF' as const,
      fileSizeBytes: 1024,
      status: 'EXTRACTED' as const,
      extractedData: { personalData: {} } as never,
      fieldConfidence: { 'personalData.email': 0.9 },
      creditsUsed: 0,
    };

    await repository.create('user-1', data);

    expect(cvImport.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        ...data,
        extractedData: data.extractedData,
        fieldConfidence: data.fieldConfidence,
      },
    });
  });

  it('findAllByUserId() excludes soft-deleted rows, most-recent-first', async () => {
    const { prisma, cvImport } = buildPrismaMock();
    const repository = new CvImportRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(cvImport.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findById() excludes soft-deleted rows', async () => {
    const { prisma, cvImport } = buildPrismaMock();
    const repository = new CvImportRepository(prisma);

    await repository.findById('cvi-1');

    expect(cvImport.findFirst).toHaveBeenCalledWith({ where: { id: 'cvi-1', deletedAt: null } });
  });

  it('update() with status/masterResumeId writes those fields as-is', async () => {
    const { prisma, cvImport } = buildPrismaMock();
    const repository = new CvImportRepository(prisma);

    await repository.update('cvi-1', { status: 'CONFIRMED', masterResumeId: 'mr-1' });

    expect(cvImport.update).toHaveBeenCalledWith({
      where: { id: 'cvi-1' },
      data: { status: 'CONFIRMED', masterResumeId: 'mr-1', aiSuggestions: undefined },
    });
  });

  it('update() with AI enhancement fields (FASE 22) serializes aiSuggestions as Json', async () => {
    const { prisma, cvImport } = buildPrismaMock();
    const repository = new CvImportRepository(prisma);
    const suggestions = [
      {
        section: 'workExperiences' as const,
        index: 0,
        field: 'position',
        originalValue: 'Engineer',
        suggestedValue: 'Software Engineer',
        reason: 'clean up',
        confidence: 0.8,
      },
    ];

    await repository.update('cvi-1', {
      aiSuggestions: suggestions,
      aiUnresolvedFields: ['Company name looks truncated.'],
      aiRequestId: 'ai-req-1',
      creditsUsed: 30,
    });

    expect(cvImport.update).toHaveBeenCalledWith({
      where: { id: 'cvi-1' },
      data: {
        aiSuggestions: suggestions,
        aiUnresolvedFields: ['Company name looks truncated.'],
        aiRequestId: 'ai-req-1',
        creditsUsed: 30,
      },
    });
  });
});
