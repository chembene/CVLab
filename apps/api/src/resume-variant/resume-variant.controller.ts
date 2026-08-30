import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVariantService } from './resume-variant.service';
import { CreateResumeVariantDto } from './dto/create-resume-variant.dto';
import { UpdateResumeVariantDto } from './dto/update-resume-variant.dto';
import { DuplicateResumeVariantDto } from './dto/duplicate-resume-variant.dto';
import { SaveCheckpointDto } from './dto/save-checkpoint.dto';
import { SetTemplateDto } from './dto/set-template.dto';
import { ThemeOverridesDto } from '../template-engine/dto/theme-overrides.dto';

@Controller({ path: 'resume-variants', version: '1' })
@UseGuards(JwtAuthGuard)
export class ResumeVariantController {
  constructor(private readonly resumeVariantService: ResumeVariantService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.resumeVariantService.list(user, user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateResumeVariantDto) {
    return this.resumeVariantService.create(user, user.id, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.resumeVariantService.getOne(user, user.id, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateResumeVariantDto,
  ) {
    return this.resumeVariantService.update(user, user.id, id, dto);
  }

  @Post(':id/duplicate')
  duplicate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: DuplicateResumeVariantDto,
  ) {
    return this.resumeVariantService.duplicate(user, user.id, id, dto);
  }

  /** "Save Version" (rule 2, manual checkpoint). */
  @Post(':id/checkpoint')
  saveCheckpoint(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SaveCheckpointDto,
  ) {
    return this.resumeVariantService.saveCheckpoint(user, user.id, id, dto);
  }

  /** Restore a historical version onto the live Variant — creates a NEW version (rule 5). */
  @Post(':id/versions/:versionNumber/restore')
  restoreVersion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
  ) {
    return this.resumeVariantService.restoreVersion(user, user.id, id, versionNumber);
  }

  /** Duplicate a historical version into a brand new, independent Resume Variant (rule 6). */
  @Post(':id/versions/:versionNumber/duplicate')
  duplicateFromVersion(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @Body() dto: DuplicateResumeVariantDto,
  ) {
    return this.resumeVariantService.duplicateFromVersion(user, user.id, id, versionNumber, dto);
  }

  /** Phase 11 Template Engine, Part 13 — select which ResumeTemplate renders this Variant. */
  @Put(':id/template')
  setTemplate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetTemplateDto,
  ) {
    return this.resumeVariantService.setTemplate(user, user.id, id, dto.templateId);
  }

  /** Part 6 "Theme Customization" — wholesale-replaces the stored overrides. */
  @Put(':id/theme')
  updateTheme(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ThemeOverridesDto,
  ) {
    return this.resumeVariantService.updateTheme(user, user.id, id, dto);
  }

  /** Clears all theme overrides back to the selected template's own defaults. */
  @Delete(':id/theme')
  resetTheme(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.resumeVariantService.resetTheme(user, user.id, id);
  }

  @Put(':id/archive')
  archive(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.resumeVariantService.archive(user, user.id, id);
  }

  @Put(':id/restore')
  restore(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.resumeVariantService.restore(user, user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.resumeVariantService.remove(user, user.id, id);
  }
}
