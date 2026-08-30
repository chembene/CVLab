import { WalletService } from './wallet.service';
import type { WalletRepository } from './wallet.repository';

describe('WalletService', () => {
  it('getWallet() delegates to ensureWallet (lazy creation)', async () => {
    const walletRepository = {
      ensureWallet: jest.fn().mockResolvedValue({ userId: 'user-1', availableCredits: 0 }),
    };
    const service = new WalletService(walletRepository as unknown as WalletRepository);

    const result = await service.getWallet('user-1');

    expect(walletRepository.ensureWallet).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ userId: 'user-1', availableCredits: 0 });
  });
});
