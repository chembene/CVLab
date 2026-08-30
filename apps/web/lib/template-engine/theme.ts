/**
 * Moved into @cvlab/resume-renderer during Export Engine PASSO 3 — see
 * docs/architecture/export-engine.md "Rendering". This file is now just a
 * re-export so every existing import of `@/lib/template-engine/theme` keeps
 * working unchanged.
 */
export {
  resolveTheme,
  LAYOUT_DEFAULTS,
  SPACING_PX,
  MARGIN_PX,
  type ThemeOverrides,
} from '@cvlab/resume-renderer';
