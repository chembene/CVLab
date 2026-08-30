import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVersionService } from './resume-version.service';
import { CompareVersionsDto } from './dto/compare-versions.dto';

@Controller({ path: 'resume-variants/:variantId/versions', version: '1' })
@UseGuards(JwtAuthGuard)
export class ResumeVersionController {
  constructor(private readonly resumeVersionService: ResumeVersionService) {}

  @Get()
  listTimeline(@CurrentUser() user: RequestUser, @Param('variantId') variantId: string) {
    return this.resumeVersionService.listTimeline(user, user.id, variantId);
  }

  // Registered before ':versionNumber' so "compare" isn't parsed as a version number.
  @Get('compare')
  compare(
    @CurrentUser() user: RequestUser,
    @Param('variantId') variantId: string,
    @Query() query: CompareVersionsDto,
  ) {
    return this.resumeVersionService.compare(user, user.id, variantId, query.from, query.to);
  }

  @Get(':versionNumber')
  getOne(
    @CurrentUser() user: RequestUser,
    @Param('variantId') variantId: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
  ) {
    return this.resumeVersionService.getOne(user, user.id, variantId, versionNumber);
  }
}
