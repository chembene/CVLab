/**
 * Moved into @cvlab/resume-renderer during Export Engine PASSO 3, so
 * apps/api's PDF export renders the exact same component as apps/web's
 * live preview — "Preview ≈ Export" by construction, not by convention. See
 * docs/architecture/export-engine.md "Rendering". This file is now just a
 * re-export so every existing import of
 * `@/components/template-engine/layouts/ResumeLayout` keeps working
 * unchanged.
 */
export { ResumeLayout, type ResumeLayoutProps } from '@cvlab/resume-renderer';
