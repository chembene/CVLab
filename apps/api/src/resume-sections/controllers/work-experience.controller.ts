import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/interfaces/request-with-user.interface';
import { ResumeSectionsService } from '../resume-sections.service';
import { CreateWorkExperienceDto, UpdateWorkExperienceDto } from '../dto/work-experience.dto';
import { ReorderSectionsDto } from '../dto/reorder-sections.dto';

@Controller({ path: 'resume/work-experience', version: '1' })
@UseGuards(JwtAuthGuard)
export class WorkExperienceController {
  constructor(private readonly sectionsService: ResumeSectionsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.sectionsService.list('work-experience', user, user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateWorkExperienceDto) {
    return this.sectionsService.create('work-experience', user, user.id, dto);
  }

  @Put('reorder')
  reorder(@CurrentUser() user: RequestUser, @Body() dto: ReorderSectionsDto) {
    return this.sectionsService.reorder('work-experience', user, user.id, dto.orderedIds);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkExperienceDto,
  ) {
    return this.sectionsService.update('work-experience', user, user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sectionsService.remove('work-experience', user, user.id, id);
  }
}
