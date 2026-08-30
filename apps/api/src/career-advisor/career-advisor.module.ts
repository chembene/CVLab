import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { MasterResumeModule } from '../master-resume/master-resume.module';
import { ResumeSectionsModule } from '../resume-sections/resume-sections.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { ApplicationModule } from '../application/application.module';
import { AtsModule } from '../ats/ats.module';
import { InterviewModule } from '../interview/interview.module';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module';
import { PromptRegistry } from '../ai-orchestration/prompt/prompt-registry';
import { CareerAdvisorController } from './career-advisor.controller';
import { CareerAdvisorService } from './career-advisor.service';
import { CareerAdvisorRepository } from './career-advisor.repository';
import { CareerAdvisorPromptBuilder } from './prompt/career-advisor-prompt-builder';

/**
 * The Career Advisor Engine (FASE 18) — built entirely on top of AI
 * Orchestration (Phase 6), following the exact template Resume Optimization
 * (Phase 7)/Cover Letter (Phase 8)/Interview (Phase 9) established. No
 * parallel architecture: composes, but never duplicates, Profile, Master
 * Resume, Resume Sections, Job Targets, Resume Variants, Applications, ATS
 * Reports, and Interview Sessions — every read goes through their own
 * exported services/repositories, never raw Prisma access from here. Every
 * one of those sources is optional; see CareerAdvisorService.buildContext().
 * See docs/architecture/career-advisor-engine.md for the full flow.
 */
@Module({
  imports: [
    AuthModule,
    ProfileModule,
    MasterResumeModule,
    ResumeSectionsModule,
    JobTargetModule,
    ResumeVariantModule,
    ApplicationModule,
    AtsModule,
    InterviewModule,
    AiOrchestrationModule,
  ],
  controllers: [CareerAdvisorController],
  providers: [CareerAdvisorRepository, CareerAdvisorService, CareerAdvisorPromptBuilder],
  exports: [CareerAdvisorService],
})
export class CareerAdvisorModule implements OnModuleInit {
  constructor(
    private readonly promptRegistry: PromptRegistry,
    private readonly promptBuilder: CareerAdvisorPromptBuilder,
  ) {}

  onModuleInit(): void {
    this.promptRegistry.register(this.promptBuilder);
  }
}
