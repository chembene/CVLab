import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeCompletionModule } from '../resume-completion/resume-completion.module';
import { MasterResumeController } from './master-resume.controller';
import { MasterResumeService } from './master-resume.service';
import { MasterResumeRepository } from './master-resume.repository';

@Module({
  // AuthModule is imported for JwtAuthGuard (used via @UseGuards on
  // MasterResumeController), which itself depends on TokenService.
  imports: [AuthModule, ResumeCompletionModule],
  controllers: [MasterResumeController],
  providers: [MasterResumeRepository, MasterResumeService],
  exports: [MasterResumeService, MasterResumeRepository],
})
export class MasterResumeModule {}
