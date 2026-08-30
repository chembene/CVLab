import type {
  EducationLevel,
  EmploymentType,
  SalaryPeriod,
  SeniorityLevel,
} from '../interfaces/job-parser.interface';

/**
 * Small, deterministic heuristics shared by every parser for the fields
 * schema.org's `JobPosting` doesn't reliably structure on its own
 * (normalized employment type/seniority, a skills/technologies list,
 * required languages, salary mentioned only in prose, experience years,
 * education level). Curated keyword lists rather than guessed-at markup —
 * the same category of technique as CVParser's PT/EN section-header
 * dictionary (Phase 10.5 CV Import).
 */

const EMPLOYMENT_TYPE_SCHEMA_MAP: Record<string, EmploymentType> = {
  fulltime: 'Full Time',
  'full-time': 'Full Time',
  parttime: 'Part Time',
  'part-time': 'Part Time',
  contract: 'Contract',
  contractor: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
  intern: 'Internship',
  freelance: 'Freelance',
  // Not a real schema.org employmentType enum value — the caller passes
  // this synthetic key when jobLocationType: "TELECOMMUTE" was found, so
  // that signal maps through the same lookup as everything else.
  remote: 'Remote',
};

const WORK_MODE_PATTERNS: Array<[RegExp, EmploymentType]> = [
  [/\bfreelanc\w*\b/i, 'Freelance'],
  [/\bremote\b/i, 'Remote'],
  [/\bhybrid\b/i, 'Hybrid'],
  [/\bon[\s-]?site\b|\bin[\s-]?office\b/i, 'On-site'],
];

/**
 * Normalizes into the brief's fixed 9-value set (rule 6). Tries
 * schema.org's `employmentType` enum first (FULL_TIME/PART_TIME/...); when
 * that's absent, falls back to scanning free text for
 * Freelance/Remote/Hybrid/On-site — real postings often only say "Remote"
 * in prose, not in structured data. `jobLocationType: "TELECOMMUTE"` (also
 * schema.org) is treated as an explicit Remote signal by the caller before
 * this text fallback runs.
 */
export function normalizeEmploymentType(
  schemaValue: string | undefined,
  freeText: string,
): EmploymentType | undefined {
  if (schemaValue) {
    const key = schemaValue.toLowerCase().replace(/[\s_]/g, '');
    const mapped = EMPLOYMENT_TYPE_SCHEMA_MAP[key];
    if (mapped) return mapped;
  }
  for (const [re, label] of WORK_MODE_PATTERNS) {
    if (re.test(freeText)) return label;
  }
  return undefined;
}

const SENIORITY_PATTERNS: Array<[RegExp, SeniorityLevel]> = [
  [/\b(chief|ceo|cto|cfo|coo|cpo|vp|vice[\s-]president|executive)\b/i, 'Executive'],
  [/\b(director|head of)\b/i, 'Director'],
  [/\b(manager)\b/i, 'Manager'],
  [/\b(principal|staff)\b/i, 'Principal'],
  [/\b(lead|team lead|tech lead)\b/i, 'Lead'],
  [/\b(senior|sr\.?)\b/i, 'Senior'],
  [/\b(mid[\s-]?level|pleno)\b/i, 'Mid'],
  [/\b(junior|jr\.?)\b/i, 'Junior'],
  [/\b(intern|internship|trainee|est[aá]gi[oá]rio)\b/i, 'Intern'],
];

/** Normalizes into the brief's fixed 9-value set (rule 5), highest seniority first so e.g. "Senior Manager" resolves to the more senior label. */
export function normalizeSeniority(text: string): SeniorityLevel | undefined {
  for (const [re, label] of SENIORITY_PATTERNS) {
    if (re.test(text)) return label;
  }
  return undefined;
}

/**
 * Two disjoint curated lists (rules 2 & 3). "Skills" covers languages,
 * frameworks, and general tools/office software; "technologies" covers
 * cloud/infra/data-platform terms. A few terms genuinely straddle both
 * categories in casual usage (Azure, Docker) — categorized once, under
 * technologies, to keep the two lists disjoint rather than duplicating
 * matches across both.
 */
const SKILL_KEYWORDS = [
  'JavaScript',
  'TypeScript',
  'Python',
  'Java',
  'C#',
  'C++',
  'Go',
  'Golang',
  'Rust',
  'Ruby',
  'PHP',
  'Swift',
  'Kotlin',
  'Scala',
  'React',
  'Angular',
  'Vue',
  'Next.js',
  'Node.js',
  'Express',
  'NestJS',
  'Django',
  'Flask',
  'Spring',
  'Ruby on Rails',
  'Laravel',
  'SQL',
  'NoSQL',
  'Git',
  'Excel',
  'Power BI',
  'PowerPoint',
  'Word',
  'Figma',
  'Agile',
  'Scrum',
  'Kanban',
  'Jira',
  'Communication',
  'Leadership',
  'Project Management',
];

const TECHNOLOGY_KEYWORDS = [
  'AWS',
  'Azure',
  'Google Cloud',
  'GCP',
  'PostgreSQL',
  'MySQL',
  'MongoDB',
  'Redis',
  'Elasticsearch',
  'GraphQL',
  'REST',
  'Docker',
  'Kubernetes',
  'AWS Lambda',
  'Terraform',
  'Jenkins',
  'CI/CD',
  'Linux',
  'Kafka',
  'RabbitMQ',
  'Prisma',
  'TensorFlow',
  'PyTorch',
  'Snowflake',
  'Databricks',
  'Spark',
  'Hadoop',
];

/** Matches a keyword as a whole word/phrase, dedupes case-insensitively, returns the curated canonical casing. */
function detectKeywords(text: string, keywords: string[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const keyword of keywords) {
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    const re = new RegExp(`(?<![\\w.])${escapeRegex(keyword)}(?![\\w])`, 'i');
    if (re.test(text)) {
      found.push(keyword);
      seen.add(key);
    }
  }
  return found;
}

export function detectSkills(text: string): string[] {
  return detectKeywords(text, SKILL_KEYWORDS);
}

export function detectTechnologies(text: string): string[] {
  return detectKeywords(text, TECHNOLOGY_KEYWORDS);
}

const KNOWN_LANGUAGES = [
  'English',
  'Portuguese',
  'Português',
  'Spanish',
  'Español',
  'French',
  'Français',
  'German',
  'Mandarin',
  'Chinese',
  'Arabic',
  'Swahili',
  'Zulu',
];

export function detectLanguages(text: string): string[] {
  const found = new Set<string>();
  for (const lang of KNOWN_LANGUAGES) {
    const re = new RegExp(`\\b${escapeRegex(lang)}\\b`, 'i');
    if (re.test(text)) found.add(lang);
  }
  return [...found];
}

export interface ParsedSalary {
  min?: number;
  max?: number;
  currency?: string;
  period?: SalaryPeriod;
}

const CURRENCY_SYMBOLS: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', MT: 'MZN' };

const PERIOD_PATTERNS: Array<[RegExp, SalaryPeriod]> = [
  [/\b(per\s*hour|\/\s*hr|\/\s*hour|hourly)\b/i, 'HOURLY'],
  [/\b(per\s*week|\/\s*week|weekly)\b/i, 'WEEKLY'],
  [/\b(per\s*month|\/\s*month|\/\s*mo\b|monthly)\b/i, 'MONTHLY'],
  [/\b(per\s*year|per\s*annum|\/\s*year|\/\s*yr|yearly|annual(ly)?)\b/i, 'YEARLY'],
];

/** Matches "$80,000 - $100,000", "MT 50,000 - 70,000", "50000-70000 USD/year", etc., and the pay period mentioned nearby if any. */
export function parseSalaryFromText(text: string): ParsedSalary | undefined {
  const match = text.match(
    /(?<symbol>[$€£]|MT|MZN|USD|EUR|GBP)?\s?(?<min>\d[\d,.]{2,})\s*(?:-|to|–)\s*(?<symbol2>[$€£]|MT|MZN|USD|EUR|GBP)?\s?(?<max>\d[\d,.]{2,})\s*(?<currencyWord>USD|EUR|GBP|MZN)?/i,
  );
  if (!match?.groups) return undefined;

  const min = match.groups.min ? toAmount(match.groups.min) : undefined;
  const max = match.groups.max ? toAmount(match.groups.max) : undefined;
  if (min === undefined && max === undefined) return undefined;

  const symbol = match.groups.symbol ?? match.groups.symbol2;
  const currency =
    match.groups.currencyWord ?? (symbol ? (CURRENCY_SYMBOLS[symbol] ?? symbol) : undefined);

  const window = text.slice(
    Math.max(0, (match.index ?? 0) - 10),
    (match.index ?? 0) + match[0].length + 20,
  );
  let period: SalaryPeriod | undefined;
  for (const [re, label] of PERIOD_PATTERNS) {
    if (re.test(window)) {
      period = label;
      break;
    }
  }

  return { min, max, currency, period };
}

/** schema.org baseSalary.value.unitText — "YEAR"/"MONTH"/"HOUR"/"WEEK". */
export function normalizeSalaryUnitText(unitText: string | undefined): SalaryPeriod | undefined {
  switch (unitText?.toUpperCase()) {
    case 'HOUR':
      return 'HOURLY';
    case 'WEEK':
      return 'WEEKLY';
    case 'MONTH':
      return 'MONTHLY';
    case 'YEAR':
      return 'YEARLY';
    default:
      return undefined;
  }
}

export interface ParsedExperience {
  minYears?: number;
  preferredYears?: number;
}

/** Matches "5+ years", "3-5 years of experience", "minimum 2 years", "at least 3 years" (rule 8). A range's lower bound is `minYears`; its upper bound (or a standalone "5+" figure) is `preferredYears`. */
export function parseExperienceYears(text: string): ParsedExperience | undefined {
  const range = text.match(/(\d{1,2})\s*(?:-|to|–)\s*(\d{1,2})\+?\s*years?/i);
  if (range?.[1] && range[2]) {
    return { minYears: Number(range[1]), preferredYears: Number(range[2]) };
  }
  const plus = text.match(/(\d{1,2})\+\s*years?/i);
  if (plus?.[1]) {
    return { minYears: Number(plus[1]) };
  }
  const atLeast = text.match(/(?:minimum|at least|no less than)\s*(\d{1,2})\s*years?/i);
  if (atLeast?.[1]) {
    return { minYears: Number(atLeast[1]) };
  }
  return undefined;
}

const EDUCATION_PATTERNS: Array<[RegExp, EducationLevel]> = [
  [/\b(ph\.?d|doctorate|doutoramento)\b/i, 'PhD'],
  [/\b(master'?s?|mestrado|msc|m\.?sc\.?|mba)\b/i, 'Master'],
  [/\b(bachelor'?s?|licenciatura|bsc|b\.?sc\.?|undergraduate degree)\b/i, 'Bachelor'],
  [/\b(high school|ensino m[eé]dio|ensino secund[aá]rio)\b/i, 'High School'],
];

/** Highest level mentioned wins (rule 9) — postings that say "Bachelor's or Master's preferred" report the higher bar. */
export function parseEducationLevel(text: string): EducationLevel | undefined {
  for (const [re, label] of EDUCATION_PATTERNS) {
    if (re.test(text)) return label;
  }
  return undefined;
}

function toAmount(raw: string): number | undefined {
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Greenhouse (`/<company>/jobs/<id>`) and Lever (`/<company>/<id>`) board URLs both put the company slug as the first path segment — a stable, documented convention of each product's URL structure, used only as a low-confidence fallback when neither JSON-LD nor Open Graph name the company. */
export function deriveCompanyFromFirstPathSegment(url: string): string | undefined {
  try {
    const segment = new URL(url).pathname.split('/').filter(Boolean)[0];
    return segment ? titleCaseSlug(segment) : undefined;
  } catch {
    return undefined;
  }
}

/** Workday tenant URLs are shaped `https://<company>.wd#.myworkdayjobs.com/...` — the subdomain before `.wd` is the tenant/company slug. */
export function deriveCompanyFromWorkdaySubdomain(url: string): string | undefined {
  try {
    const host = new URL(url).hostname;
    const match = host.match(/^([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com$/i);
    const slug = match?.[1];
    return slug ? titleCaseSlug(slug) : undefined;
  } catch {
    return undefined;
  }
}

function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
    .join(' ');
}
