import type {
  CvMergeResolution,
  ExtractedCvData,
  MergeEntryResult,
  MergePreview,
} from '@/lib/api/cv-import';

/**
 * FASE 7 audit (2026-08-12) — one-time association between the review
 * screen's editable `reviewData` and the read-only `MergePreview` the
 * backend computed. `MergePreview`'s arrays are index-aligned with the
 * ORIGINAL extracted data at the moment `analyzeMerge()` ran server-side
 * (same order, same length, nothing filtered) — so a plain index lookup here
 * is correct, but only as a one-time seed: once `existingSectionId` is
 * copied onto a `reviewData` entry, the association lives on the entry
 * itself and survives the user reordering/removing other entries
 * afterwards (index correlation is never relied on again after this runs).
 *
 * Idempotent — an entry that already carries `existingSectionId` (already
 * seeded, or the user is editing after a preview refetch) is left
 * untouched, never overwritten.
 */
function seedList<T extends CvMergeResolution>(
  entries: T[],
  results: MergeEntryResult<T>[] | undefined,
): T[] {
  if (!results) return entries;
  return entries.map((entry, index) => {
    if (entry.existingSectionId) return entry;
    const existingId = results[index]?.existingId;
    return existingId ? { ...entry, existingSectionId: existingId } : entry;
  });
}

export function seedExistingSectionIds(
  data: ExtractedCvData,
  preview: MergePreview,
): ExtractedCvData {
  return {
    ...data,
    workExperiences: seedList(data.workExperiences, preview.workExperiences),
    educations: seedList(data.educations, preview.educations),
    skills: seedList(data.skills, preview.skills),
    languages: seedList(data.languages, preview.languages),
    certificates: seedList(data.certificates, preview.certificates),
    projects: seedList(data.projects, preview.projects),
    awards: seedList(data.awards, preview.awards),
    volunteerExperiences: seedList(data.volunteerExperiences, preview.volunteerExperiences),
    references: seedList(data.references, preview.references),
  };
}
