import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVariantService } from './resume-variant.service';
import { CreateResumeVariantDto } from './dto/create-resume-variant.dto';
import { UpdateResumeVariantDto } from './dto/update-resume-variant.dto';
import { DuplicateResumeVariantDto } from './dto/duplicate-resume-variant.dto';

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
