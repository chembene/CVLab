import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { LinkedInService } from './linkedin.service';
import { CreateLinkedInProfileDto } from './dto/create-linkedin-profile.dto';

@Controller({ path: 'linkedin', version: '1' })
@UseGuards(JwtAuthGuard)
export class LinkedInController {
  constructor(private readonly linkedInService: LinkedInService) {}

  @Post('profile')
  generateProfile(@CurrentUser() user: RequestUser, @Body() dto: CreateLinkedInProfileDto) {
    return this.linkedInService.generateProfile(user, user.id, dto);
  }

  @Get('profile')
  list(@CurrentUser() user: RequestUser) {
    return this.linkedInService.list(user, user.id);
  }

  @Get('profile/:id')
  getOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.linkedInService.getOne(user, user.id, id);
  }
}
