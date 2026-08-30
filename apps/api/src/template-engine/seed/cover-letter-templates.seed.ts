import type { CoverLetterTemplateCategory } from '@prisma/client';

/**
 * The 7 built-in Cover Letter Templates (Phase 11 brief, Part 3) — same
 * single-source-of-truth rationale as resume-templates.seed.ts.
 *
 * `CoverLetterTemplateCategory` has exactly 7 values (PROFESSIONAL,
 * EXECUTIVE, MODERN, CORPORATE, CREATIVE, MINIMAL, ACADEMIC), but the
 * brief's 7 requested names are Professional/Executive/Modern/Corporate/
 * Government/Minimal/Startup — "Government" and "Startup" have no literal
 * category match. Mapped as the closest fit: Government → ACADEMIC (both a
 * formal, institutional register), Startup → CREATIVE (energetic, informal)
 * — documented in docs/architecture/template-engine.md §4.
 *
 * `layout` reuses the SAME shared-layout-engine mechanism as resume
 * templates, with 4 distinct cover-letter-specific layout keys — a cover
 * letter's structure (salutation → body → closing) is simple enough that
 * fewer layouts cover the same visual range as the 5 resume ones.
 */
export interface CoverLetterTemplateSeedRow {
  id: string;
  name: string;
  category: CoverLetterTemplateCategory;
  isATSFriendly: boolean;
  premium: boolean;
  primaryColor: string;
  secondaryColor: string;
  font: string;
  layout: string;
  supportedSections: string[];
}

/** A cover letter has far less structure than a resume — just these 3 addressable parts. */
const LETTER_SECTIONS = ['header', 'body', 'signature'];

export const COVER_LETTER_TEMPLATE_SEED: CoverLetterTemplateSeedRow[] = [
  {
    id: 'cl-professional',
    name: 'Professional',
    category: 'PROFESSIONAL',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#1E3A8A',
    secondaryColor: '#334155',
    font: 'Georgia',
    layout: 'letter-classic',
    supportedSections: LETTER_SECTIONS,
  },
  {
    id: 'cl-executive',
    name: 'Executive',
    category: 'EXECUTIVE',
    isATSFriendly: true,
    premium: true,
    primaryColor: '#111827',
    secondaryColor: '#B45309',
    font: 'Playfair Display',
    layout: 'letter-header-band',
    supportedSections: LETTER_SECTIONS,
  },
  {
    id: 'cl-modern',
    name: 'Modern',
    category: 'MODERN',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#2563EB',
    secondaryColor: '#1E3A8A',
    font: 'Inter',
    layout: 'letter-modern',
    supportedSections: LETTER_SECTIONS,
  },
  {
    id: 'cl-corporate',
    name: 'Corporate',
    category: 'CORPORATE',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#1D4ED8',
    secondaryColor: '#1E293B',
    font: 'Calibri',
    layout: 'letter-classic',
    supportedSections: LETTER_SECTIONS,
  },
  {
    id: 'cl-government',
    name: 'Government',
    category: 'ACADEMIC',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#374151',
    secondaryColor: '#1F2937',
    font: 'Times New Roman',
    layout: 'letter-classic',
    supportedSections: LETTER_SECTIONS,
  },
  {
    id: 'cl-minimal',
    name: 'Minimal',
    category: 'MINIMAL',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#111827',
    secondaryColor: '#6B7280',
    font: 'Helvetica',
    layout: 'letter-minimal',
    supportedSections: LETTER_SECTIONS,
  },
  {
    id: 'cl-startup',
    name: 'Startup',
    category: 'CREATIVE',
    isATSFriendly: true,
    premium: false,
    primaryColor: '#059669',
    secondaryColor: '#064E3B',
    font: 'Poppins',
    layout: 'letter-modern',
    supportedSections: LETTER_SECTIONS,
  },
];
