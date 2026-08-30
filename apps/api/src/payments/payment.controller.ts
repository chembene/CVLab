import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

/** Self-service only — targetUserId is always the caller's own id, same pattern as every other feature controller. The provider callback lives in a separate, unauthenticated controller (payment-callback.controller.ts). */
@Controller({ path: 'payments', version: '1' })
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreatePaymentDto) {
    return this.paymentService.create(user, user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.paymentService.list(user, user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.paymentService.getOne(user, user.id, id);
  }

  /** Manual status poll — prompts/12-mpesa-integration.md §15 ("allow the system to query payment status where supported"). Reuses the exact same confirmation path a webhook callback would. */
  @Post(':id/verify')
  verify(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.paymentService.verify(user, user.id, id);
  }
}
