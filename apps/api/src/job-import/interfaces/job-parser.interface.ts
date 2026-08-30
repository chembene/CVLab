/** The fixed normalization target set for ParsedJobData.seniority (rule 5). */
export const SENIORITY_LEVELS = [
  'Intern',
  'Junior',
  'Mid',
  'Senior',
  'Lead',
  'Principal',
  'Manager',
  'Director',
  'Executive',
] as const;
export type SeniorityLevel = (typeof SENIORITY_LEVELS)[number];

/**
 * The fixed normalization target set for ParsedJobData.employmentType
 * (rule 6). Deliberately mixes contract-type (Full Time/Part Time/
 * Contract/Internship/Freelance/Temporary) and work-location
 * (Remote/Hybrid/On-site) concepts into one field, per the brief's
 * explicit single list — a real job posting can genuinely be both
 * ("Full Time" and "Remote"), but only one is stored: schema.org's
 * `employmentType` enum is checked first, falling back to a Remote/
 * Hybrid/On-site/Freelance text scan only when that's absent. See
 * job-field-heuristics.util.ts normalizeEmploymentType().
 */
export const EMPLOYMENT_TYPES = [
  'Full Time',
  'Part Time',
  'Contract',
  'Internship',
  'Freelance',
  'Temporary',
  'Remote',
  'Hybrid',
  'On-site',
] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** The fixed normalization target set for ParsedJobData.educationLevel (rule 9). */
export const EDUCATION_LEVELS = ['High School', 'Bachelor', 'Master', 'PhD'] as const;
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];

export type SalaryPeriod = 'HOURLY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

/**
 * The normalized shape every JobParser produces, regardless of source ATS —
 * field names mirror JobTargetData/JobTargetSkill/JobTargetLanguage
 * (apps/api/src/job-target) so JobImportService can map 1:1 without a
 * translation layer, the same design choice CV Import's ExtractedCvData
 * made against MasterResume/section columns.
 */
export interface ParsedJobData {
  title?: string;
  company?: string;
  companyLogoUrl?: string;
  location?: string;
  employmentType?: EmploymentType;
  seniority?: SeniorityLevel;
  responsibilities: string[];
  requirements: string[];
  /** Preferred-but-not-required qualifications — always kept distinct from `requirements` (rule 11). */
  niceToHave: string[];
  languages: string[];
  benefits: string[];
  /** Individually-extracted skill keywords (rule 2) — tools, languages, office software, soft technical skills. Deduplicated, canonical casing. */
  skills: string[];
  /** Individually-extracted technology/platform keywords (rule 3) — cloud providers, databases, messaging systems, infra. Deduplicated, canonical casing, disjoint from `skills`. */
  technologies: string[];
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  salaryPeriod?: SalaryPeriod;
  experienceMinYears?: number;
  experiencePreferredYears?: number;
  educationLevel?: EducationLevel;
  /** Cleaned, human-readable full description — what JobTarget.jobDescription / JobImportMetadata.cleanedDescription store. */
  description: string;
}

/** Confidence per top-level ParsedJobData field, 0-1. Missing key means "nothing found for this field." */
export type JobFieldConfidence = Partial<Record<keyof ParsedJobData, number>>;

export interface ParsedJobResult {
  data: ParsedJobData;
  confidence: JobFieldConfidence;
}

/**
 * One parser per ATS (Greenhouse/Lever/Workday/LinkedIn/Indeed) plus one
 * generic fallback — see docs/architecture/job-import.md. Each parser is
 * self-contained: it knows its own hostname patterns and how to read its
 * own HTML, and nothing about any other parser or the registry that holds
 * it. `canHandle` is checked in registration order by ParserRegistry;
 * GenericHtmlParser always returns true and must be registered last.
 */
export interface JobParser {
  /** Short, stable label — stored as JobImportMetadata.provider. */
  readonly name: string;
  canHandle(hostname: string): boolean;
  parse(html: string, sourceUrl: string): ParsedJobResult;
}
