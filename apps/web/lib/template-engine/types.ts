/**
 * Moved into @cvlab/resume-renderer during Export Engine PASSO 3, so
 * apps/api's PDF export can render with the exact same theme/layout types
 * as apps/web's live preview — see docs/architecture/export-engine.md
 * "Rendering". This file is now just a re-export so every existing import
 * of `@/lib/template-engine/types` keeps working unchanged.
 */
export type {
  TemplateTypography,
  TemplateSpacing,
  TemplateColors,
  TemplateHeader,
  TemplateSidebar,
  TemplateLayout,
  ResolvedTheme,
} from '@cvlab/resume-renderer';
