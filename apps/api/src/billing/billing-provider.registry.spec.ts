import { NotFoundException } from '@nestjs/common';
import { PaymentProviderName } from '@prisma/client';
import { BillingProviderRegistry } from './billing-provider.registry';
import type { BillingProvider } from './billing-provider.interface';

describe('BillingProviderRegistry', () => {
  function makeProvider(name: PaymentProviderName): BillingProvider {
    return {
      provider: name,
      createPayment: jest.fn(),
      checkPaymentStatus: jest.fn(),
      processCallback: jest.fn(),
      cancelPayment: jest.fn(),
      reversePayment: jest.fn(),
    };
  }

  it('registers a provider keyed by its own .provider field', () => {
    const registry = new BillingProviderRegistry();
    const mpesa = makeProvider(PaymentProviderName.MPESA);

    registry.register(mpesa);

    expect(registry.get(PaymentProviderName.MPESA)).toBe(mpesa);
    expect(registry.has(PaymentProviderName.MPESA)).toBe(true);
    expect(registry.list()).toEqual([PaymentProviderName.MPESA]);
  });

  it('throws NotFoundException for an unregistered provider', () => {
    const registry = new BillingProviderRegistry();
    expect(() => registry.get(PaymentProviderName.MPESA)).toThrow(NotFoundException);
  });

  it('has() returns false for an unregistered provider', () => {
    const registry = new BillingProviderRegistry();
    expect(registry.has(PaymentProviderName.MPESA)).toBe(false);
  });
});
