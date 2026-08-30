import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { ResumeVersionModule } from '../resume-version/resume-version.module';
import { ProfileModule } from '../profile/profile.module';
import { CreditsModule } from '../credits/credits.module';
import { TemplateEngineModule } from '../template-engine/template-engine.module';
import { ExportRepository } from './export.repository';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { PdfResumeRenderer } from './renderers/pdf-resume.renderer';
import { DocxResumeRenderer } from './renderers/docx-resume.renderer';

/**
 * Export Engine (docs/architecture/export-engine.md) — generates a PDF/DOCX
 * from a Resume Variant (or one of its historical versions) and streams it
 * directly in the HTTP response; nothing is persisted to storage.
 * Deliberately has no dependency on AiOrchestrationModule/PromptRegistry —
 * this is not an AI feature, so it charges credits via CreditService
 * directly (exported by CreditsModule for exactly this kind of reuse).
 */
@Module({
  imports: [
    AuthModule,
    ResumeVariantModule,
    ResumeVersionModule,
    ProfileModule,
    CreditsModule,
    TemplateEngineModule,
  ],
  controllers: [ExportController],
  providers: [ExportRepository, ExportService, PdfResumeRenderer, DocxResumeRenderer],
  exports: [ExportService],
})
export class ExportModule {}
