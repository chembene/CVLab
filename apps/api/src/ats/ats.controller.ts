import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { AtsAnalysisService } from './ats-analysis.service';
import { RunAtsAnalysisDto } from './dto/run-ats-analysis.dto';

@Controller({ path: 'ats', version: '1' })
@UseGuards(JwtAuthGuard)
export class AtsController {
  constructor(private readonly atsAnalysisService: AtsAnalysisService) {}

  @Post('run')
  run(@CurrentUser() user: RequestUser, @Body() dto: RunAtsAnalysisDto) {
    return this.atsAnalysisService.run(user, user.id, dto);
  }

  @Get('reports')
  list(@CurrentUser() user: RequestUser) {
    return this.atsAnalysisService.list(user, user.id);
  }

  @Get('reports/:id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.atsAnalysisService.getOne(user, user.id, id);
  }

  @Delete('reports/:id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.atsAnalysisService.remove(user, user.id, id);
  }
}
