import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AtsAiService } from './ats-ai.service';
import { CreateAtsAiAnalysisDto } from './dto/create-ats-ai-analysis.dto';

@Controller({ path: 'ats-ai', version: '1' })
@UseGuards(JwtAuthGuard)
export class AtsAiController {
  constructor(private readonly atsAiService: AtsAiService) {}

  @Post('analyze')
  analyze(@CurrentUser() user: RequestUser, @Body() dto: CreateAtsAiAnalysisDto) {
    return this.atsAiService.analyze(user, user.id, dto);
  }

  @Get('analyses')
  list(@CurrentUser() user: RequestUser) {
    return this.atsAiService.list(user, user.id);
  }

  @Get('analyses/:id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.atsAiService.getOne(user, user.id, id);
  }
}
