import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { JobTargetService } from './job-target.service';
import { CreateJobTargetDto } from './dto/create-job-target.dto';
import { UpdateJobTargetDto } from './dto/update-job-target.dto';

@Controller({ path: 'job-targets', version: '1' })
@UseGuards(JwtAuthGuard)
export class JobTargetController {
  constructor(private readonly jobTargetService: JobTargetService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.jobTargetService.list(user, user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateJobTargetDto) {
    return this.jobTargetService.create(user, user.id, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.jobTargetService.getOne(user, user.id, id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateJobTargetDto,
  ) {
    return this.jobTargetService.update(user, user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.jobTargetService.remove(user, user.id, id);
  }
}
