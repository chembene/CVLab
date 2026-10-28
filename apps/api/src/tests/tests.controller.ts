import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { TestsService } from './tests.service';

/** The technical test catalog — `/tests`. Session lifecycle lives in TestSessionsController (`/test-sessions`), matching the pre-documented conceptual API contract in docs/architecture/api-overview.md. */
@Controller({ path: 'tests', version: '1' })
@UseGuards(JwtAuthGuard)
export class TestsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  list(@Query('category') category?: string) {
    return this.testsService.listAvailable(category);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.testsService.getTest(id);
  }

  @Post(':id/start')
  start(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.testsService.startSession(user, user.id, id);
  }
}
