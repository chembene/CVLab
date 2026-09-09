import { Module, OnModuleInit } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { MasterResumeModule } from '../master-resume/master-resume.module';
import { ResumeSectionsModule } from '../resume-sections/resume-sections.module';
import { AiOrchestrationModule } from '../ai-orchestration/ai-orchestration.module';
import { PromptRegistry } from '../ai-orchestration/prompt/prompt-registry';
import { CvImportController } from './cv-import.controller';
import { CvImportService } from './cv-import.service';
import { CvImportRepository } from './cv-import.repository';
import { CVParser } from './cv-parser';
import { CvImportPromptBuilder } from './prompt/cv-import-prompt-builder';

/**
 * The CV Import Engine (Phase 10.5) — see docs/architecture/cv-import.md —
 * plus, since FASE 22, CV Import AI (docs/architecture/cv-import-ai.md), an
 * optional layer on top registered into the same AiOrchestrationModule
 * every other AI feature uses, never a parallel pipeline. Composes
 * Profile/MasterResume/ResumeSections exactly like every other feature
 * module in this codebase: through their exported services, never raw
 * Prisma access from here.
 */
@Module({
  imports: [
    AuthModule,
    ProfileModule,
    MasterResumeModule,
    ResumeSectionsModule,
    AiOrchestrationModule,
  ],
  controllers: [CvImportController],
  providers: [CvImportRepository, CvImportService, CVParser, CvImportPromptBuilder],
  exports: [CvImportService],
})
export class CvImportModule implements OnModuleInit {
  constructor(
    private readonly promptRegistry: PromptRegistry,
    private readonly promptBuilder: CvImportPromptBuilder,
  ) {}

  onModuleInit(): void {
    this.promptRegistry.register(this.promptBuilder);
  }
}
