import type {
  ResolvedTheme,
  TemplateHeader,
  TemplateLayout,
  TemplateMetadata,
  TemplateSpacing,
  TemplateTypography,
} from './types';

/**
 * Theme resolution — 3 layers, lowest to highest priority:
 *   1. LAYOUT_DEFAULTS[template.layout]  — sensible defaults per layout key
 *   2. template.primaryColor / .secondaryColor / .font (from the DB row)
 *   3. themeOverrides (Part 6, user-chosen — Resume Variant / Cover Letter)
 *
 * This is the ONE place layout/typography/spacing/header defaults are
 * centralized — "avoid hardcoded values" (Part 11) means no renderer or
 * layout component ever invents its own magic number; everything reads
 * from the `ResolvedTheme` this function returns.
 *
 * Moved out of apps/web unchanged during Export Engine PASSO 3 — see
 * docs/architecture/export-engine.md "Rendering". apps/web's own
 * lib/template-engine/theme.ts now just re-exports from here.
 */

const BASE_TYPOGRAPHY: TemplateTypography = {
  fontFamily: 'Inter',
  fontSizeBase: 14,
  lineHeight: 1.5,
  headingScale: 1.15,
};

const BASE_SPACING: TemplateSpacing = {
  sectionGap: 'comfortable',
  pageMargin: 'normal',
};

const BASE_HEADER: TemplateHeader = {
  style: 'minimal',
  dividerStyle: 'line',
};

interface LayoutDefaults {
  layout: TemplateLayout;
  header: TemplateHeader;
  spacing?: Partial<TemplateSpacing>;
  typography?: Partial<TemplateTypography>;
}

/** One entry per layout key used by the 17 built-in templates (5 resume + 4 cover-letter) — see prisma seed data. Adding a brand-new template that reuses one of these keys requires zero new code here (Part 1's "future templates require zero engine changes"); only a genuinely new visual arrangement needs a new key + entry. */
export const LAYOUT_DEFAULTS: Record<string, LayoutDefaults> = {
  'single-column': {
    layout: {
      key: 'single-column',
      sidebar: { enabled: false, position: 'none' },
      supportsPhoto: false,
      supportsIcons: true,
      supportsTwoColumns: false,
    },
    header: { style: 'minimal', dividerStyle: 'line' },
  },
  'sidebar-left': {
    layout: {
      key: 'sidebar-left',
      sidebar: { enabled: true, position: 'left' },
      supportsPhoto: true,
      supportsIcons: true,
      supportsTwoColumns: true,
    },
    header: { style: 'sidebar', dividerStyle: 'none' },
  },
  'sidebar-right': {
    layout: {
      key: 'sidebar-right',
      sidebar: { enabled: true, position: 'right' },
      supportsPhoto: true,
      supportsIcons: true,
      supportsTwoColumns: true,
    },
    header: { style: 'sidebar', dividerStyle: 'none' },
  },
  'header-band': {
    layout: {
      key: 'header-band',
      sidebar: { enabled: false, position: 'none' },
      supportsPhoto: true,
      supportsIcons: false,
      supportsTwoColumns: false,
    },
    header: { style: 'band', dividerStyle: 'line' },
    spacing: { sectionGap: 'spacious' },
  },
  'two-column-photo': {
    layout: {
      key: 'two-column-photo',
      sidebar: { enabled: true, position: 'left' },
      supportsPhoto: true,
      supportsIcons: true,
      supportsTwoColumns: true,
    },
    header: { style: 'centered', dividerStyle: 'dotted' },
  },
  'letter-classic': {
    layout: {
      key: 'letter-classic',
      sidebar: { enabled: false, position: 'none' },
      supportsPhoto: false,
      supportsIcons: false,
      supportsTwoColumns: false,
    },
    header: { style: 'minimal', dividerStyle: 'none' },
  },
  'letter-header-band': {
    layout: {
      key: 'letter-header-band',
      sidebar: { enabled: false, position: 'none' },
      supportsPhoto: false,
      supportsIcons: false,
      supportsTwoColumns: false,
    },
    header: { style: 'band', dividerStyle: 'line' },
  },
  'letter-modern': {
    layout: {
      key: 'letter-modern',
      sidebar: { enabled: false, position: 'none' },
      supportsPhoto: false,
      supportsIcons: true,
      supportsTwoColumns: false,
    },
    header: { style: 'centered', dividerStyle: 'dotted' },
  },
  'letter-minimal': {
    layout: {
      key: 'letter-minimal',
      sidebar: { enabled: false, position: 'none' },
      supportsPhoto: false,
      supportsIcons: false,
      supportsTwoColumns: false,
    },
    header: { style: 'minimal', dividerStyle: 'none' },
    spacing: { sectionGap: 'compact' },
  },
};

const FALLBACK_LAYOUT: LayoutDefaults = LAYOUT_DEFAULTS['single-column']!;

/** Lightens/darkens is out of scope — a simple, deterministic accent derivation (secondaryColor doubles as accent unless overridden) keeps this dependency-free. */
function deriveAccent(secondaryColor: string): string {
  return secondaryColor;
}

export interface ThemeOverrides {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  fontSize?: number;
  lineHeightPercent?: number;
  sectionSpacing?: 'compact' | 'comfortable' | 'spacious';
  pageMargins?: 'narrow' | 'normal' | 'wide';
  headerStyle?: 'band' | 'minimal' | 'centered' | 'sidebar';
  dividerStyle?: 'line' | 'dotted' | 'none';
  iconsEnabled?: boolean;
  photoEnabled?: boolean;
}

export function resolveTheme(
  template: TemplateMetadata,
  overrides: ThemeOverrides | null | undefined,
): ResolvedTheme {
  const defaults = LAYOUT_DEFAULTS[template.layout] ?? FALLBACK_LAYOUT;
  const o = overrides ?? {};

  return {
    layout: defaults.layout,
    typography: {
      fontFamily:
        o.fontFamily ??
        template.font ??
        defaults.typography?.fontFamily ??
        BASE_TYPOGRAPHY.fontFamily,
      fontSizeBase: o.fontSize ?? defaults.typography?.fontSizeBase ?? BASE_TYPOGRAPHY.fontSizeBase,
      lineHeight: o.lineHeightPercent
        ? o.lineHeightPercent / 100
        : (defaults.typography?.lineHeight ?? BASE_TYPOGRAPHY.lineHeight),
      headingScale: defaults.typography?.headingScale ?? BASE_TYPOGRAPHY.headingScale,
    },
    spacing: {
      sectionGap: o.sectionSpacing ?? defaults.spacing?.sectionGap ?? BASE_SPACING.sectionGap,
      pageMargin: o.pageMargins ?? defaults.spacing?.pageMargin ?? BASE_SPACING.pageMargin,
    },
    colors: {
      primary: o.primaryColor ?? template.primaryColor,
      secondary: o.secondaryColor ?? template.secondaryColor,
      accent: o.accentColor ?? deriveAccent(o.secondaryColor ?? template.secondaryColor),
      text: '#1F2937',
      mutedText: '#6B7280',
      background: '#FFFFFF',
    },
    header: {
      style: o.headerStyle ?? defaults.header.style ?? BASE_HEADER.style,
      dividerStyle: o.dividerStyle ?? defaults.header.dividerStyle ?? BASE_HEADER.dividerStyle,
    },
    iconsEnabled: o.iconsEnabled ?? defaults.layout.supportsIcons,
    photoEnabled: o.photoEnabled ?? defaults.layout.supportsPhoto,
  };
}

/** Section-gap/page-margin named presets → real CSS values, the one place these are defined (Part 11 "avoid hardcoded values"). */
export const SPACING_PX: Record<TemplateSpacing['sectionGap'], number> = {
  compact: 8,
  comfortable: 16,
  spacious: 28,
};

export const MARGIN_PX: Record<TemplateSpacing['pageMargin'], number> = {
  narrow: 24,
  normal: 40,
  wide: 64,
};
