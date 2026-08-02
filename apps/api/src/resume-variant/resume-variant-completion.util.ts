/**
 * A Variant's completion percentage is computed from its own frozen
 * `content` snapshot, never by querying the Master Resume — the two are
 * independent from the moment of creation (see
 * docs/architecture/master-resume-data-model.md §9). Same boolean-checklist-
 * average approach as MasterResume's own completion calculator
 * (ResumeCompletionService), narrowed to the signals a snapshot actually
 * carries (no profile/photo/linkedin — those aren't copied into a Variant).
 */
export function calculateVariantCompletion(
  title: string | undefined,
  content: Record<string, unknown>,
): number {
  const isNonEmptyArray = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

  const checks = [
    Boolean(title),
    Boolean(content.summary),
    isNonEmptyArray(content.workExperiences),
    isNonEmptyArray(content.educations),
    isNonEmptyArray(content.skills),
    isNonEmptyArray(content.languages),
  ];

  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
