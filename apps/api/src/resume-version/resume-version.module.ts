import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeVersionController } from './resume-version.controller';
import { ResumeVersionService } from './resume-version.service';
import { ResumeVersionRepository } from './resume-version.repository';
import { ResumeDiffService } from './resume-diff.service';

/**
 * The Resume Version History engine (Phase 10.5) — see
 * docs/architecture/resume-version-history.md. Deliberately does NOT import
 * ResumeVariantModule: ResumeVariantModule imports *this* module (for
 * ResumeVersionRepository, to write a version row on every edit), so the
 * dependency can only run one direction. Ownership checks here go straight
 * through ResumeVersionRepository's own relation-filtered queries instead.
 */
@Module({
  imports: [AuthModule],
  controllers: [ResumeVersionController],
  providers: [ResumeVersionRepository, ResumeVersionService, ResumeDiffService],
  // ResumeVersionRepository is exported for ResumeVariantModule (creates a
  // version row on every content-changing action) and for
  // ResumeOptimizationModule/CoverLetterModule/InterviewModule/AtsModule/
  // ApplicationModule (the auto-snapshot + application-linkage hooks, all
  // routed through ResumeVariantService — see resume-variant.service.ts).
  exports: [ResumeVersionRepository, ResumeVersionService, ResumeDiffService],
})
export class ResumeVersionModule {}
