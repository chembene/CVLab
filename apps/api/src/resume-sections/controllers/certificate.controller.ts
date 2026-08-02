import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { RequestUser } from '../../auth/interfaces/request-with-user.interface';
import { ResumeSectionsService } from '../resume-sections.service';
import { CreateCertificateDto, UpdateCertificateDto } from '../dto/certificate.dto';
import { ReorderSectionsDto } from '../dto/reorder-sections.dto';

@Controller({ path: 'resume/certificates', version: '1' })
@UseGuards(JwtAuthGuard)
export class CertificateController {
  constructor(private readonly sectionsService: ResumeSectionsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.sectionsService.list('certificates', user, user.id);
  }

  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCertificateDto) {
    return this.sectionsService.create('certificates', user, user.id, dto);
  }

  @Put('reorder')
  reorder(@CurrentUser() user: RequestUser, @Body() dto: ReorderSectionsDto) {
    return this.sectionsService.reorder('certificates', user, user.id, dto.orderedIds);
  }

  @Put(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCertificateDto,
  ) {
    return this.sectionsService.update('certificates', user, user.id, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.sectionsService.remove('certificates', user, user.id, id);
  }
}
