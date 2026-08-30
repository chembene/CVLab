import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeOptimizationService } from './resume-optimization.service';
import { RunOptimizationDto } from './dto/run-optimization.dto';
import { ApplySuggestionsDto } from './dto/apply-suggestions.dto';

@Controller({ path: 'resume-optimization', version: '1' })
@UseGuards(JwtAuthGuard)
export class ResumeOptimizationController {
  constructor(private readonly resumeOptimizationService: ResumeOptimizationService) {}

  @Post('run')
  run(@CurrentUser() user: RequestUser, @Body() dto: RunOptimizationDto) {
    return this.resumeOptimizationService.run(user, user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.resumeOptimizationService.list(user, user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.resumeOptimizationService.getOne(user, user.id, id);
  }

  @Post(':id/apply')
  apply(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ApplySuggestionsDto,
  ) {
    return this.resumeOptimizationService.apply(user, user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.resumeOptimizationService.remove(user, user.id, id);
  }
}
