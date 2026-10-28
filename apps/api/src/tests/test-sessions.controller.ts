import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { TestsService } from './tests.service';
import { SubmitTestAnswerDto } from './dto/submit-test-answer.dto';

/** A user's own test-session lifecycle — `/test-sessions`. Catalog browsing lives in TestsController (`/tests`). */
@Controller({ path: 'test-sessions', version: '1' })
@UseGuards(JwtAuthGuard)
export class TestSessionsController {
  constructor(private readonly testsService: TestsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.testsService.listSessions(user, user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.testsService.getOne(user, user.id, id);
  }

  @Get(':id/result')
  getResult(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.testsService.getResult(user, user.id, id);
  }

  // Stricter than the app-wide 100/60s default (AppModule) — matches the
  // pattern AuthController/ExportController already use for their own
  // per-route @Throttle() overrides on submission-style endpoints. No new
  // rate-limiting mechanism.
  @Post(':id/answer')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  submitAnswer(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SubmitTestAnswerDto,
  ) {
    return this.testsService.submitAnswer(user, user.id, id, dto);
  }

  @Post(':id/complete')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  complete(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.testsService.completeSession(user, user.id, id);
  }
}
