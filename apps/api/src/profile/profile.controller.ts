import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller({ path: 'profile', version: '1' })
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getMyProfile(@CurrentUser() user: RequestUser) {
    return this.profileService.getForUser(user, user.id);
  }

  @Put()
  async updateMyProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
    return this.profileService.upsertForUser(user, user.id, dto);
  }
}
