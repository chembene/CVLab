import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { AtsController } from './ats.controller';
import { AtsAnalysisService } from './ats-analysis.service';
import { AtsReportRepository } from './ats-report.repository';

@Module({
  // AuthModule is imported for JwtAuthGuard. ResumeVariantModule/
  // JobTargetModule are imported so AtsAnalysisService can fetch a Variant
  // and its linked Job Target through their own ownership-checked service
  // methods, rather than reaching into their repositories directly.
  imports: [AuthModule, ResumeVariantModule, JobTargetModule],
  controllers: [AtsController],
  providers: [AtsReportRepository, AtsAnalysisService],
  // Exported for ResumeOptimizationModule (Phase 7), which reuses
  // AtsAnalysisService.run() as-is for both the "before" baseline and the
  // automatic post-apply re-run, and AtsReportRepository to look up the most
  // recent existing report for a variant (the `force` input flag).
  exports: [AtsAnalysisService, AtsReportRepository],
})
export class AtsModule {}
