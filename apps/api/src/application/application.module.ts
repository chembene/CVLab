import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { ApplicationController } from './application.controller';
import { ApplicationService } from './application.service';
import { ApplicationRepository } from './application.repository';

@Module({
  // AuthModule is imported for JwtAuthGuard (used via @UseGuards on
  // ApplicationController). JobTargetModule/ResumeVariantModule are imported
  // so ApplicationService can verify a referenced job target / resume
  // variant belongs to the applying user.
  imports: [AuthModule, JobTargetModule, ResumeVariantModule],
  controllers: [ApplicationController],
  providers: [ApplicationRepository, ApplicationService],
})
export class ApplicationModule {}
