import { NotImplementedException } from '@nestjs/common';
import { MpesaBillingProvider } from './mpesa-billing.provider';

describe('MpesaBillingProvider', () => {
  const provider = new MpesaBillingProvider();

  it('createPayment throws NotImplementedException without calling any external API', async () => {
    await expect(
      provider.createPayment({
        userId: 'u1',
        packageId: 'p1',
        amount: 100,
        currency: 'MZN',
        idempotencyKey: 'k1',
      }),
    ).rejects.toBeInstanceOf(NotImplementedException);
  });

  it('checkPaymentStatus throws NotImplementedException', async () => {
    await expect(provider.checkPaymentStatus('ref-1')).rejects.toBeInstanceOf(
      NotImplementedException,
    );
  });

  it('processCallback throws NotImplementedException', async () => {
    await expect(provider.processCallback({})).rejects.toBeInstanceOf(NotImplementedException);
  });

  it('cancelPayment throws NotImplementedException', async () => {
    await expect(provider.cancelPayment('ref-1')).rejects.toBeInstanceOf(NotImplementedException);
  });

  it('reversePayment throws NotImplementedException', async () => {
    await expect(provider.reversePayment('ref-1')).rejects.toBeInstanceOf(NotImplementedException);
  });
});
