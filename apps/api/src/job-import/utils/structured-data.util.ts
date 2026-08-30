/**
 * Extraction built entirely on public, documented web standards —
 * schema.org's `JobPosting` type (https://schema.org/JobPosting) and the
 * Open Graph protocol — rather than any single ATS's private, undocumented
 * DOM structure. Nearly every job board/ATS this phase targets
 * (Greenhouse, Lever, Workday, LinkedIn, Indeed, and most "generic" career
 * pages) emits JSON-LD `JobPosting` structured data specifically so Google
 * for Jobs can index them, which is what makes this a legitimate,
 * verifiable technique rather than guessed-at CSS selectors. Shared by
 * every parser in job-import/parsers/ — this file is not itself a parser
 * and knows nothing about any specific ATS.
 */

export interface JsonLdJobPosting {
  title?: string;
  companyName?: string;
  /** schema.org `hiringOrganization.logo` — either a plain image URL or an ImageObject with a `.url`. */
  companyLogoUrl?: string;
  /** schema.org `hiringOrganization.url` (or the first `sameAs` entry) — the company's own website, used to resolve a "company favicon" distinct from the job board's own favicon. */
  companyWebsite?: string;
  locationText?: string;
  employmentType?: string;
  /** schema.org `jobLocationType: "TELECOMMUTE"` — an explicit, structured "this is a remote job" signal. */
  isRemote?: boolean;
  descriptionHtml?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  /** schema.org `baseSalary.value.unitText` — "HOUR"/"WEEK"/"MONTH"/"YEAR". */
  salaryUnitText?: string;
  skills?: string;
  qualifications?: string;
  responsibilities?: string;
  benefits?: string;
}

/** Finds the first `<script type="application/ld+json">` block whose (possibly nested/array) content is a JobPosting, per schema.org. */
export function extractJsonLdJobPosting(html: string): JsonLdJobPosting | undefined {
  const scriptRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = scriptRe.exec(html)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const posting = findJobPosting(parsed);
    if (posting) {
      return normalizeJobPosting(posting);
    }
  }
  return undefined;
}

function findJobPosting(node: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPosting(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  const isJobPosting =
    type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'));
  if (isJobPosting) {
    return obj;
  }
  if (Array.isArray(obj['@graph'])) {
    return findJobPosting(obj['@graph']);
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeJobPosting(posting: Record<string, unknown>): JsonLdJobPosting {
  const org = posting.hiringOrganization as Record<string, unknown> | undefined;
  const location = posting.jobLocation as
    Record<string, unknown> | Record<string, unknown>[] | undefined;
  const address = extractAddress(location);
  const salary = posting.baseSalary as Record<string, unknown> | undefined;
  const salaryValue = salary?.value as Record<string, unknown> | undefined;
  const locationType = posting.jobLocationType;
  const isRemote =
    asString(locationType)?.toUpperCase() === 'TELECOMMUTE' ||
    (Array.isArray(locationType) &&
      locationType.some((v) => asString(v)?.toUpperCase() === 'TELECOMMUTE'));

  return {
    title: asString(posting.title),
    companyName: asString(org?.name),
    companyLogoUrl: extractLogoUrl(org?.logo),
    companyWebsite:
      asString(org?.url) ?? asString((org?.sameAs as unknown[])?.[0]) ?? asString(org?.sameAs),
    locationText: address,
    employmentType:
      asString(posting.employmentType) ?? asString((posting.employmentType as unknown[])?.[0]),
    isRemote,
    descriptionHtml: asString(posting.description),
    salaryMin: toNumber(salaryValue?.minValue),
    salaryMax: toNumber(salaryValue?.maxValue) ?? toNumber(salaryValue?.value),
    currency: asString(salary?.currency),
    salaryUnitText: asString(salaryValue?.unitText),
    skills: asString(posting.skills),
    qualifications: asString(posting.qualifications),
    responsibilities: asString(posting.responsibilities),
    benefits: asString(posting.jobBenefits),
  };
}

/** schema.org `logo` can be a bare URL string or an ImageObject `{ "@type": "ImageObject", "url": "..." }`. */
function extractLogoUrl(logo: unknown): string | undefined {
  if (typeof logo === 'string') return asString(logo);
  if (logo && typeof logo === 'object') {
    return asString((logo as Record<string, unknown>).url);
  }
  return undefined;
}

function extractAddress(
  location: Record<string, unknown> | Record<string, unknown>[] | undefined,
): string | undefined {
  const first = Array.isArray(location) ? location[0] : location;
  const address = first?.address as Record<string, unknown> | undefined;
  if (!address) return undefined;
  const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
    .map((p) => asString(p))
    .filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(', ') : undefined;
}

function toNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

export interface OpenGraphData {
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
}

/** Falls back to the Open Graph protocol (ogp.me) — also a real, widely-emitted standard, used when a page has no JSON-LD JobPosting. */
export function extractOpenGraph(html: string): OpenGraphData {
  const get = (property: string): string | undefined => {
    const re = new RegExp(
      `<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']*)["']`,
      'i',
    );
    return html.match(re)?.[1]?.trim() || undefined;
  };
  return {
    title: get('title'),
    description: get('description'),
    siteName: get('site_name'),
    image: get('image'),
  };
}

export function extractHtmlTitle(html: string): string | undefined {
  return html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || undefined;
}

/** The page's own `<link rel="icon"|"shortcut icon">`, resolved to an absolute URL against `baseUrl`. */
export function extractFaviconUrl(html: string, baseUrl: string): string | undefined {
  const match = html.match(
    /<link[^>]+rel=["'](?:shortcut icon|icon)["'][^>]+href=["']([^"']+)["']/i,
  );
  const href = match?.[1];
  if (!href) return undefined;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

/** Strips tags/scripts/styles and decodes the handful of entities that show up in real job descriptions, collapsing whitespace into readable paragraphs. */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
}
