import { AiRequestTrackingRepository } from './ai-request-tracking.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('AiRequestTrackingRepository', () => {
  function buildPrismaMock() {
    const aiRequest = { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() };
    const prisma = { aiRequest } as unknown as jest.Mocked<PrismaService>;
    return { prisma, aiRequest };
  }

  it('create() writes userId plus the provided fields', async () => {
    const { prisma, aiRequest } = buildPrismaMock();
    const repository = new AiRequestTrackingRepository(prisma);

    await repository.create('user-1', { feature: 'cv_improvement', idempotencyKey: 'k1' });

    expect(aiRequest.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', feature: 'cv_improvement', idempotencyKey: 'k1' },
    });
  });

  it('findByIdempotencyKey() queries by the unique idempotencyKey field', async () => {
    const { prisma, aiRequest } = buildPrismaMock();
    const repository = new AiRequestTrackingRepository(prisma);

    await repository.findByIdempotencyKey('k1');

    expect(aiRequest.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: 'k1' } });
  });

  it('update() writes to the given id', async () => {
    const { prisma, aiRequest } = buildPrismaMock();
    const repository = new AiRequestTrackingRepository(prisma);

    await repository.update('req-1', { status: 'SUCCEEDED' });

    expect(aiRequest.update).toHaveBeenCalledWith({
      where: { id: 'req-1' },
      data: { status: 'SUCCEEDED' },
    });
  });
});
