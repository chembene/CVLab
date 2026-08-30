import { Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { TemplateEngineService } from './template-engine.service';
import { ListResumeTemplatesQueryDto } from './dto/list-resume-templates-query.dto';
import { ListCoverLetterTemplatesQueryDto } from './dto/list-cover-letter-templates-query.dto';

/**
 * The catalog itself (list/get, both template types) is a shared, read-only
 * resource — every authenticated user sees the same rows, so those routes
 * take no ownership check. Favorites/recently-used are per-user, so those
 * follow the established self-service (`user.id` is always both requester
 * and target) + admin-bypass-at-service-layer pattern every other
 * controller in this codebase uses.
 */
@Controller({ path: 'templates', version: '1' })
@UseGuards(JwtAuthGuard)
export class TemplateEngineController {
  constructor(private readonly templateEngineService: TemplateEngineService) {}

  @Get('resume')
  listResumeTemplates(@Query() query: ListResumeTemplatesQueryDto) {
    return this.templateEngineService.listResumeTemplates(query);
  }

  @Get('resume/favorites')
  listFavoriteResumeTemplates(@CurrentUser() user: RequestUser) {
    return this.templateEngineService.listFavoriteResumeTemplates(user, user.id);
  }

  @Get('resume/recent')
  listRecentlyUsedResumeTemplates(@CurrentUser() user: RequestUser) {
    return this.templateEngineService.listRecentlyUsedResumeTemplates(user, user.id);
  }

  @Get('resume/:id')
  getResumeTemplate(@Param('id') id: string) {
    return this.templateEngineService.getResumeTemplate(id);
  }

  @Post('resume/:id/favorite')
  async favoriteResumeTemplate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.templateEngineService.favoriteResumeTemplate(user, user.id, id);
    return { favorited: true };
  }

  @Delete('resume/:id/favorite')
  async unfavoriteResumeTemplate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.templateEngineService.unfavoriteResumeTemplate(user, user.id, id);
    return { favorited: false };
  }

  @Get('cover-letter')
  listCoverLetterTemplates(@Query() query: ListCoverLetterTemplatesQueryDto) {
    return this.templateEngineService.listCoverLetterTemplates(query);
  }

  @Get('cover-letter/favorites')
  listFavoriteCoverLetterTemplates(@CurrentUser() user: RequestUser) {
    return this.templateEngineService.listFavoriteCoverLetterTemplates(user, user.id);
  }

  @Get('cover-letter/recent')
  listRecentlyUsedCoverLetterTemplates(@CurrentUser() user: RequestUser) {
    return this.templateEngineService.listRecentlyUsedCoverLetterTemplates(user, user.id);
  }

  @Get('cover-letter/:id')
  getCoverLetterTemplate(@Param('id') id: string) {
    return this.templateEngineService.getCoverLetterTemplate(id);
  }

  @Post('cover-letter/:id/favorite')
  async favoriteCoverLetterTemplate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.templateEngineService.favoriteCoverLetterTemplate(user, user.id, id);
    return { favorited: true };
  }

  @Delete('cover-letter/:id/favorite')
  async unfavoriteCoverLetterTemplate(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    await this.templateEngineService.unfavoriteCoverLetterTemplate(user, user.id, id);
    return { favorited: false };
  }
}
