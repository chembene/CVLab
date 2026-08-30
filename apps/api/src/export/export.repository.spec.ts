import { ExportRepository } from './export.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('ExportRepository', () => {
  function buildPrismaMock() {
    const exportedDocument = { upsert: jest.fn(), update: jest.fn() };
    const prisma = { exportedDocument } as unknown as jest.Mocked<PrismaService>;
    return { prisma, exportedDocument };
  }

  it('upsertPending() creates a fresh PENDING row keyed on idempotencyKey, or resets an existing one back to PENDING', async () => {
    const { prisma, exportedDocument } = buildPrismaMock();
    const repository = new ExportRepository(prisma);
    const data = {
      userId: 'user-1',
      resumeVariantId: 'rv-1',
      resumeVariantVersionId: undefined,
      format: 'PDF' as const,
      idempotencyKey: 'export:resume:user-1:rv-1:1:PDF',
    };

    await repository.upsertPending(data);

    expect(exportedDocument.upsert).toHaveBeenCalledWith({
      where: { idempotencyKey: data.idempotencyKey },
      create: { ...data, status: 'PENDING' },
      update: { status: 'PENDING', failureReason: null, completedAt: null },
    });
  });

  it('markSuccess() sets status SUCCESS, creditsCharged, and completedAt', async () => {
    const { prisma, exportedDocument } = buildPrismaMock();
    const repository = new ExportRepository(prisma);

    await repository.markSuccess('export-1', 10);

    expect(exportedDocument.update).toHaveBeenCalledWith({
      where: { id: 'export-1' },
      data: { status: 'SUCCESS', creditsCharged: 10, completedAt: expect.any(Date) },
    });
  });

  it('markFailed() sets status FAILED, creditsCharged/creditsRefunded, failureReason, and completedAt', async () => {
    const { prisma, exportedDocument } = buildPrismaMock();
    const repository = new ExportRepository(prisma);

    await repository.markFailed('export-1', 10, 10, 'Chromium crashed.');

    expect(exportedDocument.update).toHaveBeenCalledWith({
      where: { id: 'export-1' },
      data: {
        status: 'FAILED',
        creditsCharged: 10,
        creditsRefunded: 10,
        failureReason: 'Chromium crashed.',
        completedAt: expect.any(Date),
      },
    });
  });
});
