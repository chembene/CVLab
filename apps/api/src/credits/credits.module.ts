import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsController } from './credits.controller';
import { AdminCreditsController } from './admin-credits.controller';
import { CreditPackageController } from './credit-package.controller';
import { WalletRepository } from './wallet.repository';
import { WalletService } from './wallet.service';
import { CreditTransactionRepository } from './credit-transaction.repository';
import { FeaturePricingRepository } from './feature-pricing.repository';
import { CreditPackageRepository } from './credit-package.repository';
import { AuditLogRepository } from './audit-log.repository';
import { RefundService } from './refund.service';
import { CreditService } from './credit.service';

@Module({
  // AuthModule is imported for JwtAuthGuard/RolesGuard (used via @UseGuards
  // on all three controllers), which itself depends on TokenService.
  imports: [AuthModule],
  controllers: [CreditsController, AdminCreditsController, CreditPackageController],
  providers: [
    WalletRepository,
    WalletService,
    CreditTransactionRepository,
    FeaturePricingRepository,
    CreditPackageRepository,
    AuditLogRepository,
    RefundService,
    CreditService,
  ],
  // Exported for the Payments module to call allocateFromPurchase()
  // directly (Payments & Credits phase) and to look up a package's
  // price/credits at both payment-creation and payment-confirmation time
  // without duplicating that read logic.
  exports: [CreditService, WalletService, RefundService, CreditPackageRepository],
})
export class CreditsModule {}
