import { AuditLogRepository } from './audit-log.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('AuditLogRepository', () => {
  it('create() writes actorId plus the provided fields', async () => {
    const auditLog = { create: jest.fn() };
    const prisma = { auditLog } as unknown as jest.Mocked<PrismaService>;
    const repository = new AuditLogRepository(prisma);

    await repository.create('admin-1', {
      action: 'credits.adjust',
      targetType: 'user',
      targetId: 'user-1',
      reason: 'Support case #123',
    });

    expect(auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        action: 'credits.adjust',
        targetType: 'user',
        targetId: 'user-1',
        reason: 'Support case #123',
      },
    });
  });
});
