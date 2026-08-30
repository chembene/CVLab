import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { WalletService } from './wallet.service';
import { CreditService } from './credit.service';
import { EstimateCreditsDto } from './dto/estimate-credits.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';

/** Self-service only, per prompts/13-api-contracts.md §13 — the backend decides eligibility; the frontend only displays what these return. */
@Controller({ path: 'credits', version: '1' })
@UseGuards(JwtAuthGuard)
export class CreditsController {
  constructor(
    private readonly walletService: WalletService,
    private readonly creditService: CreditService,
  ) {}

  @Get()
  getWallet(@CurrentUser() user: RequestUser) {
    return this.walletService.getWallet(user.id);
  }

  @Get('transactions')
  listTransactions(@CurrentUser() user: RequestUser, @Query() query: ListTransactionsQueryDto) {
    return this.creditService.listTransactions(user.id, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }

  @Post('estimate')
  estimate(@CurrentUser() user: RequestUser, @Body() dto: EstimateCreditsDto) {
    return this.creditService.estimate(user.id, dto.featureKey);
  }
}
