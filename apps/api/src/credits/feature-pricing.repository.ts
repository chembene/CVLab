import { Injectable } from '@nestjs/common';
import type { FeaturePricing } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Only Prisma access for the `feature_pricing` table lives here. Read-only in this phase — admin management of prices is Phase 12 (Admin Dashboard) scope. */
@Injectable()
export class FeaturePricingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActiveByKey(featureKey: string): Promise<FeaturePricing | null> {
    return this.prisma.featurePricing.findFirst({ where: { featureKey, active: true } });
  }
}
