import { CreditsController } from './credits.controller';
import type { WalletService } from './wallet.service';
import type { CreditService } from './credit.service';
import { UserRole } from '@prisma/client';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('CreditsController', () => {
  let walletService: jest.Mocked<WalletService>;
  let creditService: jest.Mocked<CreditService>;
  let controller: CreditsController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    walletService = { getWallet: jest.fn() } as unknown as jest.Mocked<WalletService>;
    creditService = {
      listTransactions: jest.fn(),
      estimate: jest.fn(),
    } as unknown as jest.Mocked<CreditService>;
    controller = new CreditsController(walletService, creditService);
  });

  it('getWallet() delegates to WalletService for the current user, never a client-supplied id', async () => {
    walletService.getWallet.mockResolvedValue({ availableCredits: 100 } as never);

    const result = await controller.getWallet(user);

    expect(walletService.getWallet).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ availableCredits: 100 });
  });

  it('listTransactions() defaults page/limit when the query is empty', async () => {
    creditService.listTransactions.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });

    await controller.listTransactions(user, {});

    expect(creditService.listTransactions).toHaveBeenCalledWith('user-1', { page: 1, limit: 20 });
  });

  it('listTransactions() forwards an explicit page/limit', async () => {
    creditService.listTransactions.mockResolvedValue({
      items: [],
      total: 0,
      page: 2,
      limit: 10,
      totalPages: 0,
    });

    await controller.listTransactions(user, { page: 2, limit: 10 });

    expect(creditService.listTransactions).toHaveBeenCalledWith('user-1', { page: 2, limit: 10 });
  });

  it('estimate() delegates to CreditService with the current user and requested feature', async () => {
    creditService.estimate.mockResolvedValue({
      featureKey: 'cv_improvement',
      cost: 30,
      currentBalance: 100,
      sufficientBalance: true,
      balanceAfter: 70,
    });

    await controller.estimate(user, { featureKey: 'cv_improvement' });

    expect(creditService.estimate).toHaveBeenCalledWith('user-1', 'cv_improvement');
  });
});
