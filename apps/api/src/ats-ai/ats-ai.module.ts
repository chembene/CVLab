import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AtsModule } from '../ats/ats.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module';
import { PromptRegistry } from '../ai-orchestration/prompt/prompt-registry';
import { AtsAiController } from './ats-ai.controller';
import { AtsAiService } from './ats-ai.service';
import { AtsAiRepository } from './ats-ai.repository';
import { AtsAiPromptBuilder } from './prompt/ats-ai-prompt-builder';

/**
 * The ATS AI Engine (FASE 20) — built entirely on top of AI Orchestration
 * (Phase 6), following the exact template Resume Optimization (Phase 7)/
 * Cover Letter (Phase 8)/Career Advisor (FASE 18)/LinkedIn (FASE 19)
 * established. No parallel architecture, and — critically — no duplicated
 * ATS engine: this module never recomputes keyword matching, skill
 * matching, or scoring. It composes, but never duplicates, the
 * deterministic ATS Engine (Phase 4, via AtsAnalysisService.getOne()),
 * Resume Variant, and Job Target — every read goes through their own
 * exported services, never raw Prisma access from here. See
 * docs/architecture/ats-ai-engine.md for the full flow and the explicit
 * "ATS deterministic vs ATS AI" boundary.
 */
@Module({
  imports: [AuthModule, AtsModule, ResumeVariantModule, JobTargetModule, AiOrchestrationModule],
  controllers: [AtsAiController],
  providers: [AtsAiRepository, AtsAiService, AtsAiPromptBuilder],
  exports: [AtsAiService],
})
export class AtsAiModule implements OnModuleInit {
  constructor(
    private readonly promptRegistry: PromptRegistry,
    private readonly promptBuilder: AtsAiPromptBuilder,
  ) {}

  onModuleInit(): void {
    this.promptRegistry.register(this.promptBuilder);
  }
}
