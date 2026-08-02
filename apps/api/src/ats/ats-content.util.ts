/**
 * Reads facts out of a Resume Variant's frozen `content` snapshot (see
 * docs/architecture/master-resume-data-model.md §9) without knowing its
 * exact shape ahead of time — deliberately tolerant of missing/malformed
 * fields, since `content` can be wholesale-replaced by the client via
 * `PUT /resume-variants/:id` with only light `@IsObject()` validation.
 */

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) collectStrings(nested, out);
  }
}

/**
 * One lowercase haystack of every string value anywhere in `content` —
 * summary, job titles, company names, descriptions, achievements,
 * technologies, skill/language names, everything. This is what keyword
 * matching searches against, matching how a real ATS scans a document's
 * full text rather than one specific field.
 */
export function buildSearchableText(content: Record<string, unknown>): string {
  const out: string[] = [];
  collectStrings(content, out);
  return out.join('\n').toLowerCase();
}

/** Pulls a named string field out of each object in an array section (e.g. `name` from `skills`, `language` from `languages`), skipping anything malformed. */
export function extractNames(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) =>
      item && typeof item === 'object'
        ? String((item as Record<string, unknown>)[field] ?? '')
        : '',
    )
    .filter((name) => name.length > 0);
}

/** Length of an array-shaped section, or 0 if absent/malformed. */
export function sectionCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}
