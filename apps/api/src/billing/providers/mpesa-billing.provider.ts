import { Injectable, NotImplementedException } from '@nestjs/common';
import { PaymentProviderName } from '@prisma/client';
import type {
  BillingProvider,
  CreatePaymentInput,
  ProviderCallbackResult,
  ProviderPaymentHandle,
  ProviderStatusResult,
} from '../billing-provider.interface';

/**
 * Placeholder implementation — Phase 5 explicitly builds only the
 * abstraction and this stub, per docs/architecture/payment-architecture.md
 * §5 ("Explicitly Deferred to Phase 4/real-integration implementation").
 * No M-Pesa endpoint, credential, header, or payload shape is invented
 * here — per prompts/00-rules.md "Do Not Guess" and
 * prompts/12-mpesa-integration.md §2, those must come from the official
 * M-Pesa developer portal at the phase that actually integrates it. Every
 * method throws NotImplementedException; nothing here calls any external
 * API. Mirrors the same disclosed-stub pattern as JobTargetAnalysisService
 * (Phase 2B) and ResumeVariant's future-AI hooks.
 */
@Injectable()
export class MpesaBillingProvider implements BillingProvider {
  readonly provider = PaymentProviderName.MPESA;

  async createPayment(_input: CreatePaymentInput): Promise<ProviderPaymentHandle> {
    throw new NotImplementedException('M-Pesa integration is not implemented yet.');
  }

  async checkPaymentStatus(_providerReference: string): Promise<ProviderStatusResult> {
    throw new NotImplementedException('M-Pesa integration is not implemented yet.');
  }

  async processCallback(_rawPayload: unknown): Promise<ProviderCallbackResult> {
    throw new NotImplementedException('M-Pesa integration is not implemented yet.');
  }

  async cancelPayment(_providerReference: string): Promise<void> {
    throw new NotImplementedException('M-Pesa integration is not implemented yet.');
  }

  async reversePayment(_providerReference: string): Promise<void> {
    throw new NotImplementedException('M-Pesa integration is not implemented yet.');
  }
}
