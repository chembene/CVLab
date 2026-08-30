import { Body, Controller, HttpCode, Param, ParseEnumPipe, Post } from '@nestjs/common';
import { PaymentProviderName } from '@prisma/client';
import { PaymentService } from './payment.service';

/**
 * Dedicated, unauthenticated webhook route — deliberately separate from
 * PaymentController (no JwtAuthGuard: the caller is the payment provider's
 * server, not a logged-in user). Per prompts/12-mpesa-integration.md §11,
 * this endpoint validates/identifies/verifies/dedupes entirely through
 * PaymentService.handleCallback() → BillingProvider.processCallback()
 * (provider-specific request validation, e.g. signature checking, belongs
 * inside that provider's own implementation — not invented here, since the
 * exact mechanism is unknown until the official M-Pesa docs are consulted;
 * see billing-provider.interface.ts). The exact success/ack response shape
 * a real provider expects is likewise deferred to that same integration
 * point — a 200 with no body is the safe, generic default until then.
 */
@Controller({ path: 'payments/callback', version: '1' })
export class PaymentCallbackController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post(':provider')
  @HttpCode(200)
  async handle(
    @Param('provider', new ParseEnumPipe(PaymentProviderName)) provider: PaymentProviderName,
    @Body() rawPayload: unknown,
  ): Promise<void> {
    await this.paymentService.handleCallback(provider, rawPayload);
  }
}
