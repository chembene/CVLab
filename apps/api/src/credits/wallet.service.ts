import { Injectable } from '@nestjs/common';
import type { CreditWallet } from '@prisma/client';
import { WalletRepository } from './wallet.repository';

/** Owns wallet existence/reads. Registration (Phase 1) never creates a wallet row — every user effectively "has" one the moment they need it, via lazy creation here. */
@Injectable()
export class WalletService {
  constructor(private readonly walletRepository: WalletRepository) {}

  async getWallet(userId: string): Promise<CreditWallet> {
    return this.walletRepository.ensureWallet(userId);
  }
}
