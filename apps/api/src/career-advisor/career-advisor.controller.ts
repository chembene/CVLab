import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { CareerAdvisorService } from './career-advisor.service';
import { CreateAdviceDto } from './dto/create-advice.dto';

@Controller({ path: 'career-advisor', version: '1' })
@UseGuards(JwtAuthGuard)
export class CareerAdvisorController {
  constructor(private readonly careerAdvisorService: CareerAdvisorService) {}

  @Post('advice')
  requestAdvice(@CurrentUser() user: RequestUser, @Body() dto: CreateAdviceDto) {
    return this.careerAdvisorService.requestAdvice(user, user.id, dto);
  }

  @Get('advice')
  list(@CurrentUser() user: RequestUser) {
    return this.careerAdvisorService.list(user, user.id);
  }

  @Get('advice/:id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.careerAdvisorService.getOne(user, user.id, id);
  }
}
