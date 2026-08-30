import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ExportService } from './export.service';
import { CreateExportDto } from './dto/create-export.dto';

/**
 * The only binary-file endpoint in the API — every other controller returns
 * JSON through the global `ResponseInterceptor`'s {success,data} envelope,
 * which would corrupt a PDF/DOCX buffer if it ran here (it wraps whatever
 * the handler returns, and a `StreamableFile`/`Buffer` would get
 * JSON-serialized instead of streamed). Using `@Res()` WITHOUT
 * `{ passthrough: true }` (unlike every other controller's cookie-setting
 * use of `@Res()`) tells Nest to hand over the response entirely — the
 * interceptor still runs but its mapped output is never sent, since we call
 * `res.send()` ourselves. Thrown exceptions still go through the normal
 * `AllExceptionsFilter` exactly as everywhere else, because nothing is
 * written to `res` until generation has actually succeeded.
 * See docs/architecture/export-engine.md §"HTTP response".
 */
@Controller({ path: 'exports', version: '1' })
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  // Headless-Chromium PDF rendering is materially heavier than a typical
  // request; stricter than the app-wide 100/60s default (see AppModule),
  // matching the pattern AuthController already uses for its own
  // per-route @Throttle() overrides — no new rate-limiting mechanism.
  @Post('resume')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async exportResume(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateExportDto,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.exportService.exportResume(user, user.id, dto);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    res.setHeader('Content-Length', result.buffer.length.toString());
    res.send(result.buffer);
  }
}
