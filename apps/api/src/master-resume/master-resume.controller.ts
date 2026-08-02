import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { MasterResumeService } from './master-resume.service';
import { CreateMasterResumeDto } from './dto/create-master-resume.dto';
import { UpdateMasterResumeDto } from './dto/update-master-resume.dto';

@Controller({ path: 'resume', version: '1' })
@UseGuards(JwtAuthGuard)
export class MasterResumeController {
  constructor(private readonly masterResumeService: MasterResumeService) {}

  @Get()
  async getMyResume(@CurrentUser() user: RequestUser) {
    return this.masterResumeService.getForUser(user, user.id);
  }

  @Post()
  async createMyResume(@CurrentUser() user: RequestUser, @Body() dto: CreateMasterResumeDto) {
    return this.masterResumeService.createForUser(user, user.id, dto);
  }

  @Put()
  async updateMyResume(@CurrentUser() user: RequestUser, @Body() dto: UpdateMasterResumeDto) {
    return this.masterResumeService.updateForUser(user, user.id, dto);
  }
}
