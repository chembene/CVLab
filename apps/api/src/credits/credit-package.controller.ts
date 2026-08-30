import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreditPackageRepository } from './credit-package.repository';

/**
 * Top-level `/credit-packages`, deliberately not nested under `/credits`
 * (Payments & Credits phase, Decision 3) — a shared, read-only catalog
 * resource, same pattern as `/templates/resume` (Template Engine): no
 * per-user data, but still authenticated/self-service per this project's
 * "every protected endpoint requires a token" convention, not a public
 * unauthenticated route.
 */
@Controller({ path: 'credit-packages', version: '1' })
@UseGuards(JwtAuthGuard)
export class CreditPackageController {
  constructor(private readonly repository: CreditPackageRepository) {}

  @Get()
  list() {
    return this.repository.findAllActive();
  }
}
