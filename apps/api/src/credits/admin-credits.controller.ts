import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { CreditService } from './credit.service';
import { AdminAdjustCreditsDto } from './dto/admin-adjust-credits.dto';

/** Conceptually separated from the user-facing /credits routes, per prompts/13-api-contracts.md §18. Every adjustment is audit-logged (see CreditService.adjustBalance). */
@Controller({ path: 'admin/credits', version: '1' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminCreditsController {
  constructor(private readonly creditService: CreditService) {}

  @Post('adjust')
  adjust(@CurrentUser() admin: RequestUser, @Body() dto: AdminAdjustCreditsDto) {
    return this.creditService.adjustBalance(admin.id, dto);
  }
}
