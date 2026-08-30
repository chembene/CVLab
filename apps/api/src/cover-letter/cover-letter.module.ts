import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { AtsModule } from '../ats/ats.module';
import { ResumeOptimizationModule } from '../resume-optimization/resume-optimization.module';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module';
import { PromptRegistry } from '../ai-orchestration/prompt/prompt-registry';
import { TemplateEngineModule } from '../template-engine/template-engine.module';
import { CoverLetterController } from './cover-letter.controller';
import { CoverLetterService } from './cover-letter.service';
import { CoverLetterRepository } from './cover-letter.repository';
import { CoverLetterPromptBuilder } from './cover-letter-prompt-builder';

/**
 * The AI Cover Letter Engine (Phase 8) — the second real feature built on
 * top of AI Orchestration (Phase 6), following the exact template Resume
 * Optimization (Phase 7) established. Composes, but never duplicates,
 * Resume Variants, Job Targets, the ATS Engine, and Resume Optimization:
 * every read/write to those domains goes through their own exported
 * services/repositories, never raw Prisma access from here. See
 * docs/architecture/cover-letter-engine.md for the full flow.
 */
@Module({
  imports: [
    AuthModule,
    ResumeVariantModule,
    JobTargetModule,
    AtsModule,
    ResumeOptimizationModule,
    AiOrchestrationModule,
    TemplateEngineModule,
  ],
  controllers: [CoverLetterController],
  providers: [CoverLetterRepository, CoverLetterService, CoverLetterPromptBuilder],
  // Exported for InterviewModule (Phase 9), which reuses getOne() to verify
  // an optional coverLetterId belongs to the same user and to read its
  // content for the interview question prompt.
  exports: [CoverLetterService],
})
export class CoverLetterModule implements OnModuleInit {
  constructor(
    private readonly promptRegistry: PromptRegistry,
    private readonly promptBuilder: CoverLetterPromptBuilder,
  ) {}

  onModuleInit(): void {
    this.promptRegistry.register(this.promptBuilder);
  }
}
