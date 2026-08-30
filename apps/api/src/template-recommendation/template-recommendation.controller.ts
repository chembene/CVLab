import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { TemplateRecommendationService } from './template-recommendation.service';
import { CreateTemplateRecommendationDto } from './dto/create-template-recommendation.dto';

@Controller({ path: 'template-recommendations', version: '1' })
@UseGuards(JwtAuthGuard)
export class TemplateRecommendationController {
  constructor(private readonly templateRecommendationService: TemplateRecommendationService) {}

  @Post()
  recommend(@CurrentUser() user: RequestUser, @Body() dto: CreateTemplateRecommendationDto) {
    return this.templateRecommendationService.recommend(user, user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.templateRecommendationService.list(user, user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.templateRecommendationService.getOne(user, user.id, id);
  }
}
