/**
 * A single, deliberately duplicated function — apps/web's own
 * `lib/format.ts` has its own `formatDate()` (used by dozens of unrelated
 * pages, not moved here to avoid an unnecessary cross-package rewire) with
 * identical behavior. This is the one disclosed exception to "don't
 * duplicate the templates" (docs/architecture/export-engine.md
 * "Rendering"): a 2-line, dependency-free `Intl` wrapper, not template
 * logic.
 */
export function formatDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
