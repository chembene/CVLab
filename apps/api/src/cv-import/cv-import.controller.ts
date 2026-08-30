import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { CvImportService, MAX_CV_FILE_SIZE_BYTES } from './cv-import.service';
import { ConfirmCvImportDto } from './dto/confirm-cv-import.dto';

@Controller({ path: 'cv-import', version: '1' })
@UseGuards(JwtAuthGuard)
export class CvImportController {
  constructor(private readonly cvImportService: CvImportService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CV_FILE_SIZE_BYTES } }))
  upload(@CurrentUser() user: RequestUser, @UploadedFile() file: Express.Multer.File) {
    return this.cvImportService.upload(user, user.id, file);
  }

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.cvImportService.list(user, user.id);
  }

  @Get(':id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cvImportService.getOne(user, user.id, id);
  }

  /** Phase 12, brief §14/§15 — "Encontrámos N possíveis duplicados e M novas entradas", computed before the user ever commits. Read-only. */
  @Get(':id/merge-preview')
  previewMerge(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cvImportService.previewMerge(user, user.id, id);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ConfirmCvImportDto,
  ) {
    return this.cvImportService.confirm(user, user.id, id, dto);
  }

  @Post(':id/discard')
  discard(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cvImportService.discard(user, user.id, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cvImportService.remove(user, user.id, id);
  }
}
