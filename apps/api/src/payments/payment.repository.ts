import { Injectable } from '@nestjs/common';
import type { Payment, PaymentProviderName, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreatePaymentData {
  userId: string;
  packageId: string;
  provider: PaymentProviderName;
  amount: Prisma.Decimal | number;
  currency: string;
  expiresAt: Date;
}

/** Only Prisma access for the `payments` table lives here. */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreatePaymentData): Promise<Payment> {
    return this.prisma.payment.create({ data: { ...data, status: 'PENDING' } });
  }

  findById(id: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { id } });
  }

  findByProviderReference(
    provider: PaymentProviderName,
    providerReference: string,
  ): Promise<Payment | null> {
    return this.prisma.payment.findUnique({
      where: { provider_providerReference: { provider, providerReference } },
    });
  }

  findAllByUserId(userId: string): Promise<Payment[]> {
    return this.prisma.payment.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  update(id: string, data: Prisma.PaymentUpdateInput): Promise<Payment> {
    return this.prisma.payment.update({ where: { id }, data });
  }

  markStatus(
    id: string,
    status: PaymentStatus,
    extra: Prisma.PaymentUpdateInput = {},
  ): Promise<Payment> {
    return this.prisma.payment.update({ where: { id }, data: { status, ...extra } });
  }
}
