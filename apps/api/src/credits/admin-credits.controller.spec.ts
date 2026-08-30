import { Reflector } from '@nestjs/core';
import { AdminCreditsController } from './admin-credits.controller';
import type { CreditService } from './credit.service';
import { UserRole } from '@prisma/client';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

describe('AdminCreditsController', () => {
  let creditService: jest.Mocked<CreditService>;
  let controller: AdminCreditsController;

  const admin: RequestUser = { id: 'admin-1', role: UserRole.ADMIN };

  beforeEach(() => {
    creditService = { adjustBalance: jest.fn() } as unknown as jest.Mocked<CreditService>;
    controller = new AdminCreditsController(creditService);
  });

  it('adjust() delegates to CreditService.adjustBalance with the acting admin as actor', async () => {
    creditService.adjustBalance.mockResolvedValue({ id: 'tx-1' } as never);
    const dto = {
      userId: 'user-1',
      amount: 50,
      type: 'ADMIN_ADJUSTMENT' as const,
      reason: 'Goodwill',
      idempotencyKey: 'k1',
    };

    const result = await controller.adjust(admin, dto);

    expect(creditService.adjustBalance).toHaveBeenCalledWith('admin-1', dto);
    expect(result).toEqual({ id: 'tx-1' });
  });

  it('is restricted to ADMIN/SUPER_ADMIN via @Roles metadata (enforced by RolesGuard)', () => {
    const reflector = new Reflector();
    const roles = reflector.get(ROLES_KEY, AdminCreditsController);
    expect(roles).toEqual([UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  });
});
