import { Module, OnModuleInit } from '@nestjs/common';
import { BillingProviderRegistry } from './billing-provider.registry';
import { MpesaBillingProvider } from './providers/mpesa-billing.provider';

/**
 * Registers every currently-available BillingProvider into
 * BillingProviderRegistry on boot. Adding a future provider (e.g. EMOLA)
 * means adding a new provider class + one more `.register()` call here —
 * never touching PaymentService or CreditsModule (Payments & Credits
 * phase, Decision 1). Only MPESA is registered today, per Decision 5 — no
 * placeholder EmolaBillingProvider exists; the registry itself is what
 * carries the multi-provider readiness, not a second unused class.
 */
@Module({
  providers: [BillingProviderRegistry, MpesaBillingProvider],
  exports: [BillingProviderRegistry],
})
export class BillingModule implements OnModuleInit {
  constructor(
    private readonly registry: BillingProviderRegistry,
    private readonly mpesaProvider: MpesaBillingProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.mpesaProvider);
  }
}
