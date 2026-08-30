/**
 * Moved into @cvlab/resume-renderer during Export Engine PASSO 3, so
 * apps/api's PDF export can render with the exact same 9+1 renderer
 * components as apps/web's live preview — "Preview ≈ Export" by
 * construction. See docs/architecture/export-engine.md "Rendering". This
 * file is now just a re-export so every existing import of
 * `@/components/template-engine/renderers` (this file, and
 * `../layouts/CoverLetterLayout.tsx`'s `HeaderRenderer` import) keeps
 * working unchanged.
 */
export {
  HeaderRenderer,
  SummaryRenderer,
  ExperienceRenderer,
  EducationRenderer,
  SkillsRenderer,
  LanguagesRenderer,
  ProjectsRenderer,
  CertificationRenderer,
  ReferenceRenderer,
  ListSectionRenderer,
} from '@cvlab/resume-renderer';
