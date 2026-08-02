import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MasterResumeModule } from '../master-resume/master-resume.module';
import { ResumeSectionsModule } from '../resume-sections/resume-sections.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { ResumeVariantController } from './resume-variant.controller';
import { ResumeVariantService } from './resume-variant.service';
import { ResumeVariantRepository } from './resume-variant.repository';

@Module({
  // AuthModule is imported for JwtAuthGuard. MasterResumeModule +
  // ResumeSectionsModule are needed to read the live Master Resume and its
  // 11 sections when building a snapshot. JobTargetModule is needed to
  // verify an optional jobTargetId belongs to the same user.
  imports: [AuthModule, MasterResumeModule, ResumeSectionsModule, JobTargetModule],
  controllers: [ResumeVariantController],
  providers: [ResumeVariantRepository, ResumeVariantService],
  // ResumeVariantService is exported for ApplicationModule, which needs to
  // verify a referenced resume variant belongs to the applying user.
  exports: [ResumeVariantService],
})
export class ResumeVariantModule {}
