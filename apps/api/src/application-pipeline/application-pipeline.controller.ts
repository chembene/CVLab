import { Body, Controller, Get, Param, Post, Put, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ApplicationPipelineService } from './application-pipeline.service';
import { StartPipelineDto } from './dto/start-pipeline.dto';
import { RunOptimizationStepDto } from './dto/run-optimization-step.dto';
import { ApplySuggestionsStepDto } from './dto/apply-suggestions-step.dto';
import { GenerateCoverLetterStepDto } from './dto/generate-cover-letter-step.dto';
import { StartInterviewStepDto } from './dto/start-interview-step.dto';
import { ExportStepDto } from './dto/export-step.dto';
import { FinalizeStepDto } from './dto/finalize-step.dto';

/**
 * Self-service only (targetUserId is always the caller's own id) — same
 * pattern as every other feature controller in this codebase. See
 * docs/architecture/application-pipeline.md §"API".
 */
@Controller({ path: 'application-pipeline', version: '1' })
@UseGuards(JwtAuthGuard)
export class ApplicationPipelineController {
  constructor(private readonly service: ApplicationPipelineService) {}

  @Post()
  start(@CurrentUser() user: RequestUser, @Body() dto: StartPipelineDto) {
    return this.service.start(user, user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.service.list(user, user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.getOne(user, user.id, id);
  }

  @Post(':id/steps/ats')
  runAtsStep(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.runAtsStep(user, user.id, id);
  }

  @Post(':id/steps/optimization')
  runOptimizationStep(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: RunOptimizationStepDto,
  ) {
    return this.service.runOptimizationStep(user, user.id, id, dto);
  }

  @Post(':id/steps/apply-suggestions')
  applySuggestionsStep(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ApplySuggestionsStepDto,
  ) {
    return this.service.applySuggestionsStep(user, user.id, id, dto);
  }

  @Post(':id/steps/cover-letter')
  generateCoverLetterStep(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: GenerateCoverLetterStepDto,
  ) {
    return this.service.generateCoverLetterStep(user, user.id, id, dto);
  }

  @Post(':id/steps/interview')
  startInterviewStep(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: StartInterviewStepDto,
  ) {
    return this.service.startInterviewStep(user, user.id, id, dto);
  }

  // Binary response, same reasoning and same @Res() non-passthrough
  // technique as ExportController.exportResume() (see that controller's own
  // doc comment) — deliberately NOT a JSON-metadata-only response that
  // tells the frontend to call POST /exports/resume separately afterward:
  // that would render the file (and spin up Chromium for PDF) a second
  // time. CreditService's idempotency key would prevent a double *charge*,
  // but not a wasted, redundant render. Calling ExportService.exportResume()
  // exactly once here, and returning its bytes directly, is both correct
  // and the only way to avoid that waste.
  @Post(':id/steps/export')
  async exportStep(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ExportStepDto,
    @Res() res: Response,
  ): Promise<void> {
    const { file } = await this.service.exportStep(user, user.id, id, dto);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', file.buffer.length.toString());
    res.send(file.buffer);
  }

  @Post(':id/steps/finalize')
  finalizeStep(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: FinalizeStepDto,
  ) {
    return this.service.finalizeStep(user, user.id, id, dto);
  }

  @Put(':id/abandon')
  abandon(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.service.abandon(user, user.id, id);
  }
}
