import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';
import { BillingModule } from '../billing/billing.module';
import { PaymentController } from './payment.controller';
import { PaymentCallbackController } from './payment-callback.controller';
import { PaymentService } from './payment.service';
import { PaymentRepository } from './payment.repository';

/**
 * Payments & Credits phase — the module every design doc anticipated
 * (module-boundaries.md "Payments (not implemented — BillingProvider
 * abstraction ready)", payment-architecture.md, prompts/12-mpesa-
 * integration.md) but that never existed until now. Composes, never
 * duplicates: CreditsModule (CreditService.allocateFromPurchase(),
 * CreditPackageRepository) and BillingModule (BillingProviderRegistry) —
 * no direct Prisma access to credit_wallets/credit_transactions from here,
 * and no concrete provider class imported outside BillingModule's own
 * registration wiring. See docs/architecture/payment-architecture.md.
 */
@Module({
  imports: [AuthModule, CreditsModule, BillingModule],
  controllers: [PaymentController, PaymentCallbackController],
  providers: [PaymentRepository, PaymentService],
})
export class PaymentsModule {}
