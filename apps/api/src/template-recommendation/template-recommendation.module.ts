import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MasterResumeModule } from '../master-resume/master-resume.module';
import { ResumeSectionsModule } from '../resume-sections/resume-sections.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { TemplateEngineModule } from '../template-engine/template-engine.module';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module';
import { PromptRegistry } from '../ai-orchestration/prompt/prompt-registry';
import { TemplateRecommendationController } from './template-recommendation.controller';
import { TemplateRecommendationService } from './template-recommendation.service';
import { TemplateRecommendationRepository } from './template-recommendation.repository';
import { TemplateRecommendationPromptBuilder } from './prompt/template-recommendation-prompt-builder';

/**
 * The Template Recommendation Engine (FASE 21) — built entirely on top of AI
 * Orchestration (Phase 6), following the exact template Career Advisor
 * (FASE 18)/LinkedIn (FASE 19)/ATS AI (FASE 20) established. No parallel
 * architecture, and — critically — no parallel Template Engine: this module
 * never creates, renders, or mutates a ResumeTemplate. It composes, but
 * never duplicates, Master Resume, Resume Sections, Resume Variant, Job
 * Target, and the Template Engine's own read-only catalog (via
 * `ResumeTemplateRepository`, already exported for exactly this kind of
 * cross-module reuse) — every read goes through their own exported
 * services/repositories, never raw Prisma access from here. See
 * docs/architecture/template-recommendation-engine.md for the full flow.
 */
@Module({
  imports: [
    AuthModule,
    MasterResumeModule,
    ResumeSectionsModule,
    ResumeVariantModule,
    JobTargetModule,
    TemplateEngineModule,
    AiOrchestrationModule,
  ],
  controllers: [TemplateRecommendationController],
  providers: [
    TemplateRecommendationRepository,
    TemplateRecommendationService,
    TemplateRecommendationPromptBuilder,
  ],
  exports: [TemplateRecommendationService],
})
export class TemplateRecommendationModule implements OnModuleInit {
  constructor(
    private readonly promptRegistry: PromptRegistry,
    private readonly promptBuilder: TemplateRecommendationPromptBuilder,
  ) {}

  onModuleInit(): void {
    this.promptRegistry.register(this.promptBuilder);
  }
}
