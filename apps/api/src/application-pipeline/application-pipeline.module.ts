import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { AtsModule } from '../ats/ats.module';
import { ResumeOptimizationModule } from '../resume-optimization/resume-optimization.module';
import { CoverLetterModule } from '../cover-letter/cover-letter.module';
import { InterviewModule } from '../interview/interview.module';
import { ExportModule } from '../export/export.module';
import { ApplicationModule } from '../application/application.module';
import { ApplicationPipelineController } from './application-pipeline.controller';
import { ApplicationPipelineService } from './application-pipeline.service';
import { ApplicationPipelineRepository } from './application-pipeline.repository';

/**
 * Smart Application Pipeline (docs/architecture/application-pipeline.md) —
 * a guided, resumable "Prepare Application" wizard that orchestrates 6
 * already-existing modules without duplicating a single line of their
 * logic: ATS Analysis, Resume Optimization, Cover Letter, Interview,
 * Export Engine, Application. Deliberately has no dependency on
 * CreditsModule or AiOrchestrationModule — this module never charges
 * credits or calls AI itself; every step it delegates to already does that
 * on its own.
 */
@Module({
  imports: [
    AuthModule,
    ResumeVariantModule,
    JobTargetModule,
    AtsModule,
    ResumeOptimizationModule,
    CoverLetterModule,
    InterviewModule,
    ExportModule,
    ApplicationModule,
  ],
  controllers: [ApplicationPipelineController],
  providers: [ApplicationPipelineRepository, ApplicationPipelineService],
})
export class ApplicationPipelineModule {}
