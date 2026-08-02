import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/interfaces/request-with-user.interface';
import { ResumeSectionsService } from '../resume-sections.service';
import { CreateAwardDto, UpdateAwardDto } from '../dto/award.dto';
import { ReorderSectionsDto } from '../dto/reorder-sections.dto';

@Controller({ path: 'resume/awards', version: '1' })
@UseGuards(JwtAuthGuard)
export class AwardController {
  constructor(private readonly sectionsService: ResumeSectionsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.sectionsService.list('awards', user, user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateAwardDto) {
    return this.sectionsService.create('awards', user, user.id, dto);
  }

  @Put('reorder')
  reorder(@CurrentUser() user: RequestUser, @Body() dto: ReorderSectionsDto) {
    return this.sectionsService.reorder('awards', user, user.id, dto.orderedIds);
  }

  @Put(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: UpdateAwardDto) {
    return this.sectionsService.update('awards', user, user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sectionsService.remove('awards', user, user.id, id);
  }
}
