/**
 * Moved into @cvlab/resume-renderer during Export Engine PASSO 3 (its
 * `title()`/`subtitle()` formatters are used by the resume renderers, which
 * apps/api's PDF export now also needs) — see
 * docs/architecture/export-engine.md "Rendering". This file is now just a
 * re-export so every existing import of `@/lib/section-fields` (the Section
 * Manager editor forms, well beyond just rendering) keeps working unchanged.
 */
export {
  SECTION_CONFIGS,
  SECTION_ORDER,
  type SectionType,
  type FieldType,
  type FieldConfig,
  type SectionItem,
  type SectionConfig,
} from '@cvlab/resume-renderer';
