import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { CoverLetterService } from './cover-letter.service';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';
import { UpdateCoverLetterDto } from './dto/update-cover-letter.dto';
import { SetTemplateDto } from './dto/set-template.dto';
import { ThemeOverridesDto } from '../template-engine/dto/theme-overrides.dto';

@Controller({ path: 'cover-letter', version: '1' })
@UseGuards(JwtAuthGuard)
export class CoverLetterController {
  constructor(private readonly coverLetterService: CoverLetterService) {}

  @Post('generate')
  generate(@CurrentUser() user: RequestUser, @Body() dto: GenerateCoverLetterDto) {
    return this.coverLetterService.generate(user, user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.coverLetterService.list(user, user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.coverLetterService.getOne(user, user.id, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCoverLetterDto,
  ) {
    return this.coverLetterService.update(user, user.id, id, dto);
  }

  /** Phase 11 Template Engine, Part 13 — select which CoverLetterTemplate renders this letter. */
  @Put(':id/template')
  setTemplate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SetTemplateDto,
  ) {
    return this.coverLetterService.setTemplate(user, user.id, id, dto.templateId);
  }

  /** Part 6 "Theme Customization" — wholesale-replaces the stored overrides. */
  @Put(':id/theme')
  updateTheme(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ThemeOverridesDto,
  ) {
    return this.coverLetterService.updateTheme(user, user.id, id, dto);
  }

  /** Clears all theme overrides back to the selected template's own defaults. */
  @Delete(':id/theme')
  resetTheme(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.coverLetterService.resetTheme(user, user.id, id);
  }

  @Post(':id/regenerate')
  regenerate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.coverLetterService.regenerate(user, user.id, id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.coverLetterService.duplicate(user, user.id, id);
  }

  @Put(':id/archive')
  archive(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.coverLetterService.archive(user, user.id, id);
  }

  @Put(':id/restore')
  restore(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.coverLetterService.restore(user, user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.coverLetterService.remove(user, user.id, id);
  }
}
