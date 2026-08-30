import type { ResumeTemplateCategory } from '@prisma/client';

/**
 * The 10 built-in Resume Templates (Phase 11 brief, Part 2), as plain data —
 * no React, no Prisma import beyond the category enum. This is the single
 * source of truth: `prisma/seed-templates.ts` upserts these rows, and every
 * e2e test that needs templates to exist seeds from this exact array rather
 * than re-typing the list, so the two can never drift apart.
 *
 * `id` is a stable, human-readable slug (not a random uuid) — Prisma's
 * `@default(uuid())` only applies when the field is omitted; supplying our
 * own stable id makes re-seeding an idempotent `upsert`, not an
 * ever-growing set of duplicate rows, and makes fixtures readable in tests.
 *
 * `category` mapping is a deliberate best-fit choice against the fixed
 * `ResumeTemplateCategory` enum (11 values) for these 10 template names —
 * documented in docs/architecture/template-engine.md §4. `HEALTHCARE` is
 * intentionally left unused here — reserved headroom for a future template,
 * proving "future templates require zero engine changes" (Part 1).
 *
 * `layout` selects which shared layout engine (apps/web/lib/template-engine
 * /layouts) renders this template — Part 9's "templates define layout only,
 * renderer components must be shared across templates". Exactly 5 distinct
 * layout keys are used across all 10 templates, on purpose.
 */
export interface ResumeTemplateSeedRow {
  id: string;
  name: string;
  category: ResumeTemplateCategory;
  isATSFriendly: boolean;
  premium: boolean;
  primaryColor: string;
  secondaryColor: string;
  font: string;
  layout: string;
  supportedSections: string[];
}

/** Every array section the resume data model can carry — see resume-variant-snapshot.util.ts's SECTION_TYPE_TO_CONTENT_KEY. Plus "summary", the one scalar section every template renders. */
const ALL_SECTIONS = [
  'summary',
  'workExperiences',
  'educations',
  'skills',
  'languages',
  'certificates',
  'projects',
  'courses',
  'awards',
  'publications',
  'volunteerExperiences',
  'references',
];

/** `ALL_SECTIONS` minus the 4 least-common ones — a deliberately leaner set for compact/minimal templates. */
const CORE_SECTIONS = ALL_SECTIONS.filter(
  (s) => !['courses', 'awards', 'publications', 'volunteerExperiences'].includes(s),
);

export const RESUME_TEMPLATE_SEED: ResumeTemplateSeedRow[] = [
  {
    id: 'modern',
    name: 'Modern',
    category: 'MODERN',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#2563EB',
    secondaryColor: '#1E3A8A',
    font: 'Inter',
    layout: 'sidebar-left',
    supportedSections: ALL_SECTIONS,
  },
  {
    id: 'professional',
    name: 'Professional',
    category: 'FINANCE',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#0F172A',
    secondaryColor: '#334155',
    font: 'Georgia',
    layout: 'single-column',
    supportedSections: ALL_SECTIONS,
  },
  {
    id: 'executive',
    name: 'Executive',
    category: 'EXECUTIVE',
    isATSFriendly: true,
    premium: true,
    primaryColor: '#111827',
    secondaryColor: '#B45309',
    font: 'Playfair Display',
    layout: 'header-band',
    supportedSections: CORE_SECTIONS,
  },
  {
    id: 'minimal',
    name: 'Minimal',
    category: 'MINIMAL',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#111827',
    secondaryColor: '#6B7280',
    font: 'Helvetica',
    layout: 'single-column',
    supportedSections: CORE_SECTIONS,
  },
  {
    id: 'ats-classic',
    name: 'ATS Classic',
    category: 'ATS_CLASSIC',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#000000',
    secondaryColor: '#333333',
    font: 'Arial',
    layout: 'single-column',
    supportedSections: ALL_SECTIONS,
  },
  {
    id: 'technology',
    name: 'Technology',
    category: 'DEVELOPER',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#059669',
    secondaryColor: '#064E3B',
    font: 'JetBrains Mono',
    layout: 'sidebar-right',
    supportedSections: ALL_SECTIONS,
  },
  {
    id: 'creative',
    name: 'Creative',
    category: 'CREATIVE',
    // Two-column-with-photo layouts routinely break naive ATS parsers —
    // disclosed honestly here rather than claiming ATS-friendliness every
    // template doesn't actually have.
    isATSFriendly: false,
    premium: false,
    primaryColor: '#DB2777',
    secondaryColor: '#831843',
    font: 'Poppins',
    layout: 'two-column-photo',
    supportedSections: ALL_SECTIONS.filter((s) => s !== 'references'),
  },
  {
    id: 'elegant',
    name: 'Elegant',
    category: 'MARKETING',
    isATSFriendly: true,
    premium: true,
    primaryColor: '#78716C',
    secondaryColor: '#1C1917',
    font: 'Cormorant Garamond',
    layout: 'header-band',
    supportedSections: CORE_SECTIONS,
  },
  {
    id: 'corporate',
    name: 'Corporate',
    category: 'EUROPASS',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#1D4ED8',
    secondaryColor: '#1E293B',
    font: 'Calibri',
    layout: 'single-column',
    supportedSections: ALL_SECTIONS,
  },
  {
    id: 'academic',
    name: 'Academic',
    category: 'ACADEMIC',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#7C2D12',
    secondaryColor: '#292524',
    font: 'Times New Roman',
    layout: 'single-column',
    supportedSections: ALL_SECTIONS,
  },
];
