import { FeaturePricingRepository } from './feature-pricing.repository';
import type { PrismaService } from '../prisma/prisma.service';

describe('FeaturePricingRepository', () => {
  it('findActiveByKey() filters by featureKey and active:true', async () => {
    const featurePricing = { findFirst: jest.fn() };
    const prisma = { featurePricing } as unknown as jest.Mocked<PrismaService>;
    const repository = new FeaturePricingRepository(prisma);

    await repository.findActiveByKey('cv_improvement');

    expect(featurePricing.findFirst).toHaveBeenCalledWith({
      where: { featureKey: 'cv_improvement', active: true },
    });
  });
});
