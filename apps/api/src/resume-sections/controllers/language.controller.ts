import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/interfaces/request-with-user.interface';
import { ResumeSectionsService } from '../resume-sections.service';
import { CreateLanguageDto, UpdateLanguageDto } from '../dto/language.dto';
import { ReorderSectionsDto } from '../dto/reorder-sections.dto';

@Controller({ path: 'resume/languages', version: '1' })
@UseGuards(JwtAuthGuard)
export class LanguageController {
  constructor(private readonly sectionsService: ResumeSectionsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.sectionsService.list('languages', user, user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateLanguageDto) {
    return this.sectionsService.create('languages', user, user.id, dto);
  }

  @Put('reorder')
  reorder(@CurrentUser() user: RequestUser, @Body() dto: ReorderSectionsDto) {
    return this.sectionsService.reorder('languages', user, user.id, dto.orderedIds);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.sectionsService.update('languages', user, user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sectionsService.remove('languages', user, user.id, id);
  }
}
