import { ApplicationPipelineRepository } from './application-pipeline.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('ApplicationPipelineRepository', () => {
  function buildPrismaMock() {
    const applicationPipelineSession = {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    };
    const prisma = { applicationPipelineSession } as unknown as jest.Mocked<PrismaService>;
    return { prisma, applicationPipelineSession };
  }

  it('create() overrides the schema-level JOB_IMPORT default to ATS_ANALYSIS — a session cannot exist without an already-selected Job Target', async () => {
    const { prisma, applicationPipelineSession } = buildPrismaMock();
    const repository = new ApplicationPipelineRepository(prisma);

    await repository.create('user-1', 'rv-1', 'jt-1');

    expect(applicationPipelineSession.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        resumeVariantId: 'rv-1',
        jobTargetId: 'jt-1',
        currentStep: 'ATS_ANALYSIS',
      },
    });
  });

  it('findById() excludes soft-deleted rows', async () => {
    const { prisma, applicationPipelineSession } = buildPrismaMock();
    const repository = new ApplicationPipelineRepository(prisma);

    await repository.findById('session-1');

    expect(applicationPipelineSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'session-1', deletedAt: null },
    });
  });

  it('findAllByUserId() excludes soft-deleted rows and orders newest first', async () => {
    const { prisma, applicationPipelineSession } = buildPrismaMock();
    const repository = new ApplicationPipelineRepository(prisma);

    await repository.findAllByUserId('user-1');

    expect(applicationPipelineSession.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('update() passes the given fields straight through', async () => {
    const { prisma, applicationPipelineSession } = buildPrismaMock();
    const repository = new ApplicationPipelineRepository(prisma);

    await repository.update('session-1', { atsReportId: 'ats-1', currentStep: 'OPTIMIZATION' });

    expect(applicationPipelineSession.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: { atsReportId: 'ats-1', currentStep: 'OPTIMIZATION' },
    });
  });
});
