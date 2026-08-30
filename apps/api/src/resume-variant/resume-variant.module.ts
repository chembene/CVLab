import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MasterResumeModule } from '../master-resume/master-resume.module';
import { ResumeSectionsModule } from '../resume-sections/resume-sections.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { ResumeVersionModule } from '../resume-version/resume-version.module';
import { TemplateEngineModule } from '../template-engine/template-engine.module';
import { ResumeVariantController } from './resume-variant.controller';
import { ResumeVariantService } from './resume-variant.service';
import { ResumeVariantRepository } from './resume-variant.repository';

@Module({
  // AuthModule is imported for JwtAuthGuard. MasterResumeModule +
  // ResumeSectionsModule are needed to read the live Master Resume and its
  // 11 sections when building a snapshot. JobTargetModule is needed to
  // verify an optional jobTargetId belongs to the same user. ResumeVersionModule
  // is needed for ResumeVersionRepository — every content-changing action here
  // writes a ResumeVariantVersion row (Phase 10.5 Resume Version History,
  // see docs/architecture/resume-version-history.md). TemplateEngineModule
  // is needed for ResumeTemplateRepository — setTemplate() validates a
  // templateId exists before assigning it (Phase 11, see
  // docs/architecture/template-engine.md).
  imports: [
    AuthModule,
    MasterResumeModule,
    ResumeSectionsModule,
    JobTargetModule,
    ResumeVersionModule,
    TemplateEngineModule,
  ],
  controllers: [ResumeVariantController],
  providers: [ResumeVariantRepository, ResumeVariantService],
  // ResumeVariantService is exported for ApplicationModule, which needs to
  // verify a referenced resume variant belongs to the applying user.
  // ResumeVariantRepository is additionally exported for
  // ResumeOptimizationModule (Phase 7), which needs its transaction-aware
  // applyEdit() overload to write suggestion-applied content atomically
  // alongside marking suggestions applied — see ResumeOptimizationService.apply().
  exports: [ResumeVariantService, ResumeVariantRepository],
})
export class ResumeVariantModule {}
