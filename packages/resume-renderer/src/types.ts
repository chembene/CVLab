/**
 * Part 11 "Template Configuration" — the resolved, fully-defaulted config a
 * renderer actually reads. Nothing here is ever hardcoded inside a renderer
 * component; every value flows through `resolveTheme()` (theme.ts).
 *
 * Moved out of apps/web unchanged during Export Engine PASSO 3 — see
 * docs/architecture/export-engine.md "Rendering". apps/web's own
 * lib/template-engine/types.ts now just re-exports from here.
 */
export interface TemplateTypography {
  fontFamily: string;
  fontSizeBase: number; // px
  lineHeight: number; // unitless multiplier, e.g. 1.5
  headingScale: number; // multiplier applied to fontSizeBase for section headings
}

export interface TemplateSpacing {
  sectionGap: 'compact' | 'comfortable' | 'spacious';
  pageMargin: 'narrow' | 'normal' | 'wide';
}

export interface TemplateColors {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  mutedText: string;
  background: string;
}

export interface TemplateHeader {
  style: 'band' | 'minimal' | 'centered' | 'sidebar';
  dividerStyle: 'line' | 'dotted' | 'none';
}

export interface TemplateSidebar {
  enabled: boolean;
  position: 'left' | 'right' | 'none';
}

export interface TemplateLayout {
  key: string;
  sidebar: TemplateSidebar;
  supportsPhoto: boolean;
  supportsIcons: boolean;
  supportsTwoColumns: boolean;
}

/** The fully-resolved theme a renderer consumes — see theme.ts's 3-tier merge (layout defaults < template DB fields < user overrides). */
export interface ResolvedTheme {
  layout: TemplateLayout;
  typography: TemplateTypography;
  spacing: TemplateSpacing;
  colors: TemplateColors;
  header: TemplateHeader;
  iconsEnabled: boolean;
  photoEnabled: boolean;
}

/**
 * The minimal catalog-row shape `resolveTheme()` needs — deliberately
 * re-declared here rather than importing apps/web's richer
 * `lib/api/templates.ts` `TemplateMetadata` (which also carries
 * `previewImage`/`premium`/`status`/etc., irrelevant to rendering).
 * Structurally compatible: both apps/web's API type and apps/api's Prisma
 * `ResumeTemplate`/`CoverLetterTemplate` rows satisfy this shape as-is.
 */
export interface TemplateMetadata {
  layout: string;
  primaryColor: string;
  secondaryColor: string;
  font: string;
  supportedSections: string[];
}
