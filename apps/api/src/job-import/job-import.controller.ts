import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { JobImportService } from './job-import.service';
import { ImportJobDto } from './dto/import-job.dto';

@Controller({ path: 'job-import', version: '1' })
@UseGuards(JwtAuthGuard)
export class JobImportController {
  constructor(private readonly jobImportService: JobImportService) {}

  @Post()
  importFromUrl(@CurrentUser() user: RequestUser, @Body() dto: ImportJobDto) {
    return this.jobImportService.importFromUrl(user, user.id, dto);
  }

  @Get(':jobTargetId/metadata')
  getMetadata(@CurrentUser() user: RequestUser, @Param('jobTargetId') jobTargetId: string) {
    return this.jobImportService.getImportMetadata(user, user.id, jobTargetId);
  }
}
