import { Injectable, NotFoundException } from '@nestjs/common';
import type { PaymentProviderName } from '@prisma/client';
import type { BillingProvider } from './billing-provider.interface';

/**
 * In-memory registry of every BillingProvider the Payments module can select
 * from — keyed by BillingProvider.provider (PaymentProviderName), the same
 * pattern as ai-orchestration/providers/provider-registry.ts's
 * ProviderRegistry (Payments & Credits phase, Decision 1). BillingModule
 * registers MpesaBillingProvider on boot; a future provider (EMOLA, Card)
 * registers itself the same way — PaymentService never imports a concrete
 * provider class directly, only resolves through this registry via
 * `Payment.provider`.
 */
@Injectable()
export class BillingProviderRegistry {
  private readonly providers = new Map<PaymentProviderName, BillingProvider>();

  register(provider: BillingProvider): void {
    this.providers.set(provider.provider, provider);
  }

  get(name: PaymentProviderName): BillingProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new NotFoundException(`No billing provider registered for "${name}".`);
    }
    return provider;
  }

  has(name: PaymentProviderName): boolean {
    return this.providers.has(name);
  }

  list(): PaymentProviderName[] {
    return Array.from(this.providers.keys());
  }
}
