import { Injectable } from '@nestjs/common';
import type { CreditPackage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Only Prisma access for the `credit_packages` table lives here. Read-only in this phase — admin management of packages is Phase 12 (Admin Dashboard) scope, same as FeaturePricingRepository. */
@Injectable()
export class CreditPackageRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive(): Promise<CreditPackage[]> {
    return this.prisma.creditPackage.findMany({
      where: { active: true },
      orderBy: { priceMt: 'asc' },
    });
  }

  findActiveById(id: string): Promise<CreditPackage | null> {
    return this.prisma.creditPackage.findFirst({ where: { id, active: true } });
  }

  /** Unfiltered by `active` — used once a Payment already references a package (e.g. at confirmation time), since a package deactivated mid-purchase must still honor the price/credits the user actually agreed to. */
  findById(id: string): Promise<CreditPackage | null> {
    return this.prisma.creditPackage.findUnique({ where: { id } });
  }
}
