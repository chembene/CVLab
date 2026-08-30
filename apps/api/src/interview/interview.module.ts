import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { AtsModule } from '../ats/ats.module';
import { ResumeOptimizationModule } from '../resume-optimization/resume-optimization.module';
import { CoverLetterModule } from '../cover-letter/cover-letter.module';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module';
import { PromptRegistry } from '../ai-orchestration/prompt/prompt-registry';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { InterviewRepository } from './interview.repository';
import {
  InterviewQuestionPromptBuilder,
  JobInterviewQuestionPromptBuilder,
  RoleInterviewQuestionPromptBuilder,
} from './interview-question-prompt-builder';
import {
  InterviewEvaluationPromptBuilder,
  JobInterviewEvaluationPromptBuilder,
  RoleInterviewEvaluationPromptBuilder,
} from './interview-evaluation-prompt-builder';

/**
 * The AI Interview Preparation Engine (Phase 9), redesigned for 3 modes in
 * FASE 11 — built on top of AI Orchestration (Phase 6), following the exact
 * template Resume Optimization (Phase 7) and Cover Letter (Phase 8)
 * established. Registers 6 PromptBuilders (question generation × evaluation,
 * for each of RESUME/JOB/ROLE — see ai-feature.enum.ts for why each mode
 * needs its own AIFeature key: PromptRegistry/CreditService both map 1:1 off
 * that key, and the 3 modes are genuinely different price points). Composes,
 * but never duplicates, Resume Variants, Job Targets, the ATS Engine, Resume
 * Optimization, and Cover Letter: every read/write to those domains goes
 * through their own exported services/repositories, never raw Prisma access
 * from here. See docs/architecture/interview-engine.md for the full flow.
 */
@Module({
  imports: [
    AuthModule,
    ResumeVariantModule,
    JobTargetModule,
    AtsModule,
    ResumeOptimizationModule,
    CoverLetterModule,
    AiOrchestrationModule,
  ],
  controllers: [InterviewController],
  providers: [
    InterviewRepository,
    InterviewService,
    InterviewQuestionPromptBuilder,
    JobInterviewQuestionPromptBuilder,
    RoleInterviewQuestionPromptBuilder,
    InterviewEvaluationPromptBuilder,
    JobInterviewEvaluationPromptBuilder,
    RoleInterviewEvaluationPromptBuilder,
  ],
  // Exported for ApplicationPipelineModule (Smart Application Pipeline),
  // which reuses start() as-is (mode JOB) to create the practice session at
  // the end of the guided wizard — never a second orchestration path.
  exports: [InterviewService],
})
export class InterviewModule implements OnModuleInit {
  constructor(
    private readonly promptRegistry: PromptRegistry,
    private readonly questionPromptBuilder: InterviewQuestionPromptBuilder,
    private readonly jobQuestionPromptBuilder: JobInterviewQuestionPromptBuilder,
    private readonly roleQuestionPromptBuilder: RoleInterviewQuestionPromptBuilder,
    private readonly evaluationPromptBuilder: InterviewEvaluationPromptBuilder,
    private readonly jobEvaluationPromptBuilder: JobInterviewEvaluationPromptBuilder,
    private readonly roleEvaluationPromptBuilder: RoleInterviewEvaluationPromptBuilder,
  ) {}

  onModuleInit(): void {
    this.promptRegistry.register(this.questionPromptBuilder);
    this.promptRegistry.register(this.jobQuestionPromptBuilder);
    this.promptRegistry.register(this.roleQuestionPromptBuilder);
    this.promptRegistry.register(this.evaluationPromptBuilder);
    this.promptRegistry.register(this.jobEvaluationPromptBuilder);
    this.promptRegistry.register(this.roleEvaluationPromptBuilder);
  }
}
