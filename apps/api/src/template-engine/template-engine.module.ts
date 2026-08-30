import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TemplateEngineController } from './template-engine.controller';
import { TemplateEngineService } from './template-engine.service';
import { ResumeTemplateRepository } from './resume-template.repository';
import { CoverLetterTemplateRepository } from './cover-letter-template.repository';
import { ResumeTemplateFavoriteRepository } from './resume-template-favorite.repository';
import { CoverLetterTemplateFavoriteRepository } from './cover-letter-template-favorite.repository';

/**
 * The Template Engine (Phase 11) — see
 * docs/architecture/template-engine.md. Owns the read-only template catalog
 * + per-user favorites only; it has no dependency on ResumeVariantModule or
 * CoverLetterModule — those modules import THIS one instead (for
 * ResumeTemplateRepository/CoverLetterTemplateRepository, to validate a
 * templateId before assigning it — see resume-variant.service.ts's
 * setTemplate() and cover-letter.service.ts's setTemplate()), the same
 * one-directional "leaf module" shape ResumeVersionModule established in
 * Phase 10.5.
 */
@Module({
  imports: [AuthModule],
  controllers: [TemplateEngineController],
  providers: [
    ResumeTemplateRepository,
    CoverLetterTemplateRepository,
    ResumeTemplateFavoriteRepository,
    CoverLetterTemplateFavoriteRepository,
    TemplateEngineService,
  ],
  exports: [ResumeTemplateRepository, CoverLetterTemplateRepository, TemplateEngineService],
})
export class TemplateEngineModule {}
