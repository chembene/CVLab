import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ApplicationService } from './application.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

// No GET /applications/:id — the Phase 2B brief's CRUD list for
// Applications omits a single-item route (unlike /job-targets, which has
// one); implemented literally as specified rather than adding an endpoint
// beyond what was requested.
@Controller({ path: 'applications', version: '1' })
@UseGuards(JwtAuthGuard)
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.applicationService.list(user, user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateApplicationDto) {
    return this.applicationService.create(user, user.id, dto);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.applicationService.update(user, user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.applicationService.remove(user, user.id, id);
  }
}
