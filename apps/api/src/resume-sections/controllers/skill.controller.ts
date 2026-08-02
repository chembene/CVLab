import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/interfaces/request-with-user.interface';
import { ResumeSectionsService } from '../resume-sections.service';
import { CreateSkillDto, UpdateSkillDto } from '../dto/skill.dto';
import { ReorderSectionsDto } from '../dto/reorder-sections.dto';

@Controller({ path: 'resume/skills', version: '1' })
@UseGuards(JwtAuthGuard)
export class SkillController {
  constructor(private readonly sectionsService: ResumeSectionsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.sectionsService.list('skills', user, user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateSkillDto) {
    return this.sectionsService.create('skills', user, user.id, dto);
  }

  @Put('reorder')
  reorder(@CurrentUser() user: RequestUser, @Body() dto: ReorderSectionsDto) {
    return this.sectionsService.reorder('skills', user, user.id, dto.orderedIds);
  }

  @Put(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateSkillDto) {
    return this.sectionsService.update('skills', user, user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sectionsService.remove('skills', user, user.id, id);
  }
}
