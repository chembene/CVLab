import type {
  CvFieldConfidence,
  ExtractedCvData,
  ExtractedPersonalData,
} from '@/lib/api/cv-import';

/**
 * FASE 6 audit (2026-08-12) — the review screen's top-of-page checklist
 * status for one section. Derived from REAL data only — never "found" just
 * because the array/object exists (an empty array is `'not_found'`, an
 * array whose entries all carry a warning or a low confidence score is
 * `'needs_review'`, never silently upgraded to `'found'`).
 */
export type SectionStatus = 'found' | 'partial' | 'not_found' | 'needs_review';

export interface SectionStatusItem {
  key: string;
  label: string;
  status: SectionStatus;
}

/** Below this, an entry's own confidence is treated as too uncertain to call the section "found" outright, even with no explicit warning. */
const PARTIAL_CONFIDENCE_THRESHOLD = 0.6;

interface ScoredEntry {
  confidence?: number;
  warnings?: string[];
  source?: 'document' | 'fallback';
}

function computeArraySectionStatus(entries: ScoredEntry[]): SectionStatus {
  if (entries.length === 0) return 'not_found';

  const hasWarnings = entries.some((e) => (e.warnings?.length ?? 0) > 0);
  const hasFallback = entries.some((e) => e.source === 'fallback');
  if (hasWarnings || hasFallback) return 'needs_review';

  const confidences = entries.map((e) => e.confidence ?? PARTIAL_CONFIDENCE_THRESHOLD);
  const averageConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  return averageConfidence < PARTIAL_CONFIDENCE_THRESHOLD ? 'partial' : 'found';
}

/** Personal info has no array/confidence-per-entry shape of its own — derived from which contact fields were found and the existing per-field `CvFieldConfidence` (§6 of cv-import.md), unchanged since Phase 10.5. */
function computePersonalDataStatus(
  personalData: ExtractedPersonalData,
  fieldConfidence: CvFieldConfidence | null | undefined,
): SectionStatus {
  const hasAny = Boolean(personalData.fullName || personalData.email || personalData.phone);
  if (!hasAny) return 'not_found';

  const lowConfidenceCoreField = (
    ['personalData.fullName', 'personalData.email', 'personalData.phone'] as const
  ).some((key) => {
    const score = fieldConfidence?.[key];
    return score !== undefined && score < 0.5;
  });
  if (lowConfidenceCoreField) return 'needs_review';

  const hasCore = Boolean(personalData.fullName && personalData.email);
  return hasCore ? 'found' : 'partial';
}

function computeSummaryStatus(
  summary: string | undefined,
  fieldConfidence: CvFieldConfidence | null | undefined,
): SectionStatus {
  if (!summary || summary.trim().length === 0) return 'not_found';
  const score = fieldConfidence?.summary;
  if (score !== undefined && score < 0.5) return 'needs_review';
  return 'found';
}

/**
 * Computes the checklist row for every reviewable section, in the same
 * order they appear in the review screen. Pure — no I/O, easy to unit
 * test independently of any component render.
 */
export function computeSectionStatuses(
  data: ExtractedCvData,
  fieldConfidence: CvFieldConfidence | null | undefined,
): SectionStatusItem[] {
  return [
    {
      key: 'personalData',
      label: 'Informação pessoal',
      status: computePersonalDataStatus(data.personalData, fieldConfidence),
    },
    {
      key: 'summary',
      label: 'Resumo profissional',
      status: computeSummaryStatus(data.summary, fieldConfidence),
    },
    {
      key: 'workExperiences',
      label: 'Experiência Profissional',
      status: computeArraySectionStatus(data.workExperiences),
    },
    {
      key: 'educations',
      label: 'Formação Académica',
      status: computeArraySectionStatus(data.educations),
    },
    { key: 'skills', label: 'Competências', status: computeArraySectionStatus(data.skills) },
    { key: 'languages', label: 'Idiomas', status: computeArraySectionStatus(data.languages) },
    {
      key: 'certificates',
      label: 'Certificados',
      status: computeArraySectionStatus(data.certificates),
    },
    { key: 'projects', label: 'Projetos', status: computeArraySectionStatus(data.projects) },
    { key: 'awards', label: 'Prémios', status: computeArraySectionStatus(data.awards) },
    {
      key: 'volunteerExperiences',
      label: 'Voluntariado',
      status: computeArraySectionStatus(data.volunteerExperiences),
    },
    { key: 'references', label: 'Referências', status: computeArraySectionStatus(data.references) },
  ];
}
