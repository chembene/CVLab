/**
 * Splits a cleaned job-description text into the labeled sections the brief
 * asks for (responsibilities/requirements/nice-to-have/benefits), via
 * header-keyword line matching — the same header-splitting technique
 * CVParser (Phase 10.5 CV Import Engine) uses for resumes, applied here to
 * job postings. Most JobPosting JSON-LD `description` fields are one HTML
 * blob without schema.org's optional `responsibilities`/`qualifications`
 * sub-fields populated, so this is the primary way those get filled in
 * regardless of which ATS produced the page.
 */

const SECTION_HEADERS: Record<
  'responsibilities' | 'requirements' | 'niceToHave' | 'benefits',
  string[]
> = {
  responsibilities: [
    'responsibilities',
    'what you will do',
    "what you'll do",
    'the role',
    'your role',
    'key responsibilities',
    'duties',
  ],
  requirements: [
    'requirements',
    'qualifications',
    'what we are looking for',
    "what we're looking for",
    'minimum qualifications',
    'must have',
    'required skills',
    'skills required',
  ],
  niceToHave: [
    'nice to have',
    'nice-to-have',
    'preferred qualifications',
    'preferred skills',
    'bonus points',
    'good to have',
  ],
  benefits: ['benefits', 'perks', 'what we offer', 'why join us', 'compensation and benefits'],
};

export interface JobSections {
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  benefits: string[];
}

export function splitJobSections(text: string): JobSections {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const normalized = (line: string) =>
    line
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[:\-–—]+$/, '')
      .trim();

  const headerAt = (line: string): keyof JobSections | undefined => {
    if (line.length > 60) return undefined;
    const n = normalized(line);
    for (const [key, keywords] of Object.entries(SECTION_HEADERS) as [
      keyof JobSections,
      string[],
    ][]) {
      if (keywords.some((kw) => n === kw || n.startsWith(`${kw} `))) {
        return key;
      }
    }
    return undefined;
  };

  const buckets: Record<keyof JobSections, string[]> = {
    responsibilities: [],
    requirements: [],
    niceToHave: [],
    benefits: [],
  };
  let current: keyof JobSections | undefined;

  for (const line of lines) {
    const header = headerAt(line);
    if (header) {
      current = header;
      continue;
    }
    if (current) {
      buckets[current].push(line.replace(/^[•·\-*]\s*/, ''));
    }
  }

  return buckets;
}
