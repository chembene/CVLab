import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Payment, PaymentProviderName } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { CreditService } from '../credits/credit.service';
import { CreditPackageRepository } from '../credits/credit-package.repository';
import { BillingProviderRegistry } from '../billing/billing-provider.registry';
import type { ProviderCallbackResult } from '../billing/billing-provider.interface';
import { PaymentRepository } from './payment.repository';
import type { CreatePaymentDto } from './dto/create-payment.dto';

const DEFAULT_EXPIRATION_MINUTES = 30;

/**
 * Orchestrates a credit purchase end-to-end — validate → create a PENDING
 * Payment → hand off to the resolved BillingProvider → confirm (via
 * webhook or manual verify, same confirmPayment() path either way) →
 * CreditService.allocateFromPurchase(). Never computes credit amounts
 * itself (always CreditPackage's own totalCredits/bonusCredits) and never
 * calls CreditService's ledger-writing internals directly — only its
 * already-idempotent public methods. See
 * docs/architecture/payment-architecture.md.
 */
@Injectable()
export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly creditPackageRepository: CreditPackageRepository,
    private readonly billingProviderRegistry: BillingProviderRegistry,
    private readonly creditService: CreditService,
    private readonly configService: ConfigService,
  ) {}

  async list(requestingUser: RequestUser, targetUserId: string): Promise<Payment[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const payments = await this.repository.findAllByUserId(targetUserId);
    return Promise.all(payments.map((p) => this.applyExpirationIfDue(p)));
  }

  async getOne(requestingUser: RequestUser, targetUserId: string, id: string): Promise<Payment> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const payment = await this.findOwnedOrThrow(targetUserId, id);
    return this.applyExpirationIfDue(payment);
  }

  /**
   * Creates the internal Payment record (source of truth, per
   * prompts/12-mpesa-integration.md §6) and immediately hands off to the
   * resolved provider. If the provider call fails (including — today —
   * every real provider being an unimplemented stub), the Payment is
   * marked FAILED with the reason recorded and the error is rethrown, same
   * pattern as ExportService: nothing is left dangling at PENDING, and the
   * caller sees a real HTTP error, not a silently-succeeding 201.
   */
  async create(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreatePaymentDto,
  ): Promise<Payment> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const pkg = await this.creditPackageRepository.findActiveById(dto.packageId);
    if (!pkg) {
      throw new NotFoundException('Credit package not found.');
    }

    const expirationMinutes = Number(
      this.configService.get<string>('PAYMENT_EXPIRATION_MINUTES') ?? DEFAULT_EXPIRATION_MINUTES,
    );
    const expiresAt = new Date(Date.now() + expirationMinutes * 60_000);

    const payment = await this.repository.create({
      userId: targetUserId,
      packageId: pkg.id,
      provider: dto.provider,
      amount: pkg.priceMt,
      currency: 'MZN',
      expiresAt,
    });

    const provider = this.billingProviderRegistry.get(dto.provider);
    try {
      const handle = await provider.createPayment({
        userId: targetUserId,
        packageId: pkg.id,
        amount: Number(pkg.priceMt),
        currency: 'MZN',
        idempotencyKey: `payment:${payment.id}`,
      });
      return this.repository.update(payment.id, {
        status: 'PROCESSING',
        providerReference: handle.providerReference,
        metadata: handle.redirectUrl ? { redirectUrl: handle.redirectUrl } : undefined,
      });
    } catch (error) {
      const failureReason = error instanceof Error ? error.message : 'Unknown provider error.';
      await this.repository.markStatus(payment.id, 'FAILED', { metadata: { failureReason } });
      throw error;
    }
  }

  async verify(requestingUser: RequestUser, targetUserId: string, id: string): Promise<Payment> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const payment = await this.findOwnedOrThrow(targetUserId, id);
    if (!payment.providerReference) {
      throw new BadRequestException('This payment has no provider reference to verify yet.');
    }

    const provider = this.billingProviderRegistry.get(payment.provider);
    const result = await provider.checkPaymentStatus(payment.providerReference);
    return this.confirmPayment(payment.id, {
      providerReference: payment.providerReference,
      status: result.status,
    });
  }

  /** The one entry point for a provider callback, regardless of which provider it came from — resolved by `provider`, never assumed. */
  async handleCallback(provider: PaymentProviderName, rawPayload: unknown): Promise<void> {
    const billingProvider = this.billingProviderRegistry.get(provider);
    const result = await billingProvider.processCallback(rawPayload);
    const payment = await this.repository.findByProviderReference(
      provider,
      result.providerReference,
    );
    if (!payment) {
      // Per prompts/12-mpesa-integration.md §13, an unknown/duplicate
      // callback must be handled safely, not crash the endpoint — logged
      // by the global exception filter's own structured logging if this
      // is ever surfaced as an error; here it is deliberately a silent,
      // safe no-op from the provider's point of view (nothing to confirm).
      return;
    }
    await this.confirmPayment(payment.id, result);
  }

  /**
   * The single place a Payment ever transitions to COMPLETED, reached both
   * by a provider webhook (handleCallback) and a manual status poll
   * (verify) — never duplicated between the two. Calls
   * CreditService.allocateFromPurchase() (already idempotent, keyed by
   * `payment:{id}`) BEFORE marking the Payment COMPLETED, not after: this
   * project's CreditService methods each own their own Prisma
   * `$transaction()` and don't accept an externally-supplied transaction
   * client, so a single DB transaction spanning both `payments` and
   * `credit_transactions` isn't available without extending CreditService
   * itself (out of scope — "não refatorar módulos existentes sem
   * necessidade"). Safety instead comes from ordering + idempotency: if the
   * process crashes between the two steps, retrying finds the credits
   * already allocated (allocateFromPurchase's own idempotency key returns
   * the existing transaction, no double credit) and simply completes the
   * Payment update — never the reverse (a Payment marked COMPLETED without
   * credits ever having been granted).
   */
  private async confirmPayment(
    paymentId: string,
    result: ProviderCallbackResult,
  ): Promise<Payment> {
    const payment = await this.repository.findById(paymentId);
    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }
    if (payment.status === 'COMPLETED') {
      return payment; // Idempotent no-op — duplicate callback/verify, per §13.
    }
    if (payment.providerReference && payment.providerReference !== result.providerReference) {
      throw new BadRequestException('Provider reference mismatch.');
    }

    const expired =
      payment.status === 'PENDING' && payment.expiresAt !== null && payment.expiresAt < new Date();
    if (expired) {
      return this.repository.markStatus(payment.id, 'EXPIRED');
    }

    if (result.status !== 'COMPLETED') {
      return this.repository.markStatus(payment.id, result.status, {
        providerReference: result.providerReference,
      });
    }

    const pkg = await this.creditPackageRepository.findById(payment.packageId);
    if (!pkg) {
      throw new NotFoundException('The credit package for this payment no longer exists.');
    }

    await this.creditService.allocateFromPurchase(payment.userId, {
      packageId: payment.packageId,
      totalCredits: pkg.totalCredits,
      bonusCredits: pkg.bonusCredits,
      paymentId: payment.id,
      idempotencyKey: `payment:${payment.id}`,
    });

    return this.repository.update(payment.id, {
      status: 'COMPLETED',
      providerReference: result.providerReference,
      completedAt: new Date(),
    });
  }

  /** Lazily transitions a stale PENDING payment to EXPIRED on read — see the module doc comment / docs/architecture/payment-architecture.md for why this is an on-access check rather than a background job. */
  private async applyExpirationIfDue(payment: Payment): Promise<Payment> {
    if (
      payment.status === 'PENDING' &&
      payment.expiresAt !== null &&
      payment.expiresAt < new Date()
    ) {
      return this.repository.markStatus(payment.id, 'EXPIRED');
    }
    return payment;
  }

  private async findOwnedOrThrow(targetUserId: string, id: string): Promise<Payment> {
    const payment = await this.repository.findById(id);
    if (!payment || payment.userId !== targetUserId) {
      throw new NotFoundException('Payment not found.');
    }
    return payment;
  }
}
