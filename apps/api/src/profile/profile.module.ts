import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeCompletionModule } from '../resume-completion/resume-completion.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { ProfileRepository } from './profile.repository';

@Module({
  // AuthModule is imported for JwtAuthGuard (used via @UseGuards on
  // ProfileController), which itself depends on TokenService.
  imports: [AuthModule, ResumeCompletionModule],
  controllers: [ProfileController],
  providers: [ProfileRepository, ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
