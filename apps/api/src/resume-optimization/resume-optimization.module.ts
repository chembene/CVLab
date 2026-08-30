import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { AtsModule } from '../ats/ats.module';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module';
import { PromptRegistry } from '../ai-orchestration/prompt/prompt-registry';
import { ResumeOptimizationController } from './resume-optimization.controller';
import { ResumeOptimizationService } from './resume-optimization.service';
import { ResumeOptimizationRepository } from './resume-optimization.repository';
import { ResumeOptimizationPromptBuilder } from './resume-optimization-prompt-builder';

/**
 * The AI Resume Optimization Engine (Phase 7) — the first real feature built
 * on top of AI Orchestration (Phase 6). Composes, but never duplicates,
 * Resume Variants (Phase 3), Job Targets (Phase 2B), and the ATS Engine
 * (Phase 4): every read/write to those domains goes through their own
 * exported services/repositories, never raw Prisma access from here. See
 * docs/architecture/resume-optimization.md for the full flow.
 */
@Module({
  imports: [AuthModule, ResumeVariantModule, JobTargetModule, AtsModule, AiOrchestrationModule],
  controllers: [ResumeOptimizationController],
  providers: [
    ResumeOptimizationRepository,
    ResumeOptimizationService,
    ResumeOptimizationPromptBuilder,
  ],
  // Exported for CoverLetterModule (Phase 8), which reuses getOne() to
  // verify an optional optimizationId belongs to the same user and to read
  // its summary for the cover letter prompt.
  exports: [ResumeOptimizationService],
})
export class ResumeOptimizationModule implements OnModuleInit {
  constructor(
    private readonly promptRegistry: PromptRegistry,
    private readonly promptBuilder: ResumeOptimizationPromptBuilder,
  ) {}

  onModuleInit(): void {
    this.promptRegistry.register(this.promptBuilder);
  }
}
