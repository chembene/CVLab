import type { CvImportAiSuggestion, ExtractedCvData } from '@/lib/api/cv-import';

/**
 * FASE 22 — CV Import AI. Pure, local application of one accepted suggestion
 * onto the user's current (possibly already-edited) review draft — never
 * calls the backend. This is the only place a suggestion's `suggestedValue`
 * ever reaches `reviewData`; the user still has to press "Confirmar e
 * importar" (the pre-existing, unmodified confirm() flow) for anything to
 * actually reach the Master Resume. A malformed suggestion (an index that no
 * longer exists, e.g. the user removed that entry in the review screen after
 * AI enhancement ran) is a safe no-op — never throws, never guesses.
 */
export function applyCvImportAiSuggestion(
  data: ExtractedCvData,
  suggestion: CvImportAiSuggestion,
): ExtractedCvData {
  const { section, index, field, suggestedValue } = suggestion;

  if (section === 'personalData') {
    return { ...data, personalData: { ...data.personalData, [field]: suggestedValue } };
  }
  if (section === 'summary') {
    return { ...data, summary: suggestedValue };
  }
  if (index === undefined) return data;

  const entries = data[section] as unknown as Record<string, unknown>[] | undefined;
  if (!entries || !entries[index]) return data;

  const updatedEntries = entries.map((entry, i) =>
    i === index ? { ...entry, [field]: suggestedValue } : entry,
  );
  return { ...data, [section]: updatedEntries } as ExtractedCvData;
}
