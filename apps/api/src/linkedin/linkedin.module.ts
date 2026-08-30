import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { MasterResumeModule } from '../master-resume/master-resume.module';
import { ResumeSectionsModule } from '../resume-sections/resume-sections.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module';
import { PromptRegistry } from '../ai-orchestration/prompt/prompt-registry';
import { LinkedInController } from './linkedin.controller';
import { LinkedInService } from './linkedin.service';
import { LinkedInRepository } from './linkedin.repository';
import { LinkedInPromptBuilder } from './prompt/linkedin-prompt-builder';

/**
 * The LinkedIn / Professional Profile Engine (FASE 19) — built entirely on
 * top of AI Orchestration (Phase 6), following the exact template Resume
 * Optimization (Phase 7)/Cover Letter (Phase 8)/Interview (Phase 9)/Career
 * Advisor (FASE 18) established. No parallel architecture: composes, but
 * never duplicates, Profile, Master Resume, Resume Sections, and Job
 * Targets — every read goes through their own exported services, never raw
 * Prisma access from here. Every one of those sources is optional; see
 * LinkedInService.buildContext(). See docs/architecture/linkedin-engine.md
 * for the full flow.
 */
@Module({
  imports: [
    AuthModule,
    ProfileModule,
    MasterResumeModule,
    ResumeSectionsModule,
    JobTargetModule,
    AiOrchestrationModule,
  ],
  controllers: [LinkedInController],
  providers: [LinkedInRepository, LinkedInService, LinkedInPromptBuilder],
  exports: [LinkedInService],
})
export class LinkedInModule implements OnModuleInit {
  constructor(
    private readonly promptRegistry: PromptRegistry,
    private readonly promptBuilder: LinkedInPromptBuilder,
  ) {}

  onModuleInit(): void {
    this.promptRegistry.register(this.promptBuilder);
  }
}
