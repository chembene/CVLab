import { sectionCount } from './ats-content.util';

/**
 * Fully deterministic ATS scoring — no AI/OpenAI call anywhere in this
 * file. Every function here is a pure function of its inputs, which is
 * what makes the whole engine unit-testable without mocking anything and
 * reproducible: running the same Variant against the same Job Target twice
 * always produces the same scores.
 */

// ---------------------------------------------------------------------------
// Weights — the ONE place scoring weights are configured, per the brief.
// Must sum to 1 (validated by ats-scoring.util.spec.ts).
// ---------------------------------------------------------------------------

export const ATS_SCORE_WEIGHTS = {
  keyword: 0.3,
  skills: 0.2,
  experience: 0.15,
  education: 0.1,
  language: 0.1,
  formatting: 0.1,
  completion: 0.05,
} as const;

export interface AtsSubScores {
  keywordScore: number;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  languageScore: number;
  formattingScore: number;
  completionScore: number;
}

/** Weighted average of the 7 sub-scores, rounded to the nearest whole percentage point. */
export function calculateOverallScore(scores: AtsSubScores): number {
  const weighted =
    scores.keywordScore * ATS_SCORE_WEIGHTS.keyword +
    scores.skillsScore * ATS_SCORE_WEIGHTS.skills +
    scores.experienceScore * ATS_SCORE_WEIGHTS.experience +
    scores.educationScore * ATS_SCORE_WEIGHTS.education +
    scores.languageScore * ATS_SCORE_WEIGHTS.language +
    scores.formattingScore * ATS_SCORE_WEIGHTS.formatting +
    scores.completionScore * ATS_SCORE_WEIGHTS.completion;
  return Math.round(weighted);
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

export interface KeywordComparisonResult {
  score: number;
  matched: string[];
  missing: string[];
}

/** No required keywords = nothing to be missing = full score, not a penalty for an unset requirement. */
export function compareKeywords(
  jobTargetKeywords: string[],
  searchableText: string,
): KeywordComparisonResult {
  if (jobTargetKeywords.length === 0) {
    return { score: 100, matched: [], missing: [] };
  }

  const matched: string[] = [];
  const missing: string[] = [];
  for (const keyword of jobTargetKeywords) {
    if (searchableText.includes(keyword.toLowerCase())) {
      matched.push(keyword);
    } else {
      missing.push(keyword);
    }
  }

  return { score: Math.round((matched.length / jobTargetKeywords.length) * 100), matched, missing };
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export interface JobTargetSkillInput {
  skill: string;
  required: boolean;
}

export interface SkillComparisonResult {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
}

/** Required skills count double toward the score — missing a required skill hurts more than missing an optional one. */
export function compareSkills(
  jobTargetSkills: JobTargetSkillInput[],
  resumeSkillNames: string[],
): SkillComparisonResult {
  if (jobTargetSkills.length === 0) {
    return { score: 100, matchedSkills: [], missingSkills: [] };
  }

  const normalizedResumeSkills = resumeSkillNames.map((name) => name.toLowerCase());
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];
  let earnedWeight = 0;
  let totalWeight = 0;

  for (const { skill, required } of jobTargetSkills) {
    const weight = required ? 2 : 1;
    totalWeight += weight;
    if (normalizedResumeSkills.includes(skill.toLowerCase())) {
      matchedSkills.push(skill);
      earnedWeight += weight;
    } else {
      missingSkills.push(skill);
    }
  }

  return { score: Math.round((earnedWeight / totalWeight) * 100), matchedSkills, missingSkills };
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

/**
 * Job Target has no explicit education-requirement field, so this scores
 * presence/breadth rather than matching against a requirement: no entries
 * is a real gap, one entry is reasonable, two or more is fully covered.
 */
export function scoreEducation(content: Record<string, unknown>): number {
  const count = sectionCount(content.educations);
  if (count === 0) return 0;
  if (count === 1) return 70;
  return 100;
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

export interface JobTargetLanguageInput {
  language: string;
}

/** No required languages = full score, same "no requirement, no penalty" rule as keywords. */
export function compareLanguages(
  jobTargetLanguages: JobTargetLanguageInput[],
  resumeLanguageNames: string[],
): number {
  if (jobTargetLanguages.length === 0) return 100;
  const normalized = resumeLanguageNames.map((name) => name.toLowerCase());
  const matched = jobTargetLanguages.filter((jl) =>
    normalized.includes(jl.language.toLowerCase()),
  ).length;
  return Math.round((matched / jobTargetLanguages.length) * 100);
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

const SENIORITY_MIN_YEARS: Array<{ pattern: RegExp; minYears: number }> = [
  { pattern: /senior|sr\.?\b|lead|principal|staff/i, minYears: 5 },
  { pattern: /mid|pleno|intermediate/i, minYears: 2 },
  { pattern: /junior|jr\.?\b|entry|trainee|intern|estagi[aá]rio/i, minYears: 0 },
];

/**
 * Job Target has no explicit "minimum years" field, so a minimum is
 * inferred from the free-text `seniority` field via a fixed keyword table —
 * still fully deterministic (same input always yields the same output),
 * just heuristic rather than an exact requirement. Returns null when
 * `seniority` is empty or matches none of the known patterns.
 */
export function inferMinYearsFromSeniority(seniority: string | null | undefined): number | null {
  if (!seniority) return null;
  const match = SENIORITY_MIN_YEARS.find(({ pattern }) => pattern.test(seniority));
  return match ? match.minYears : null;
}

/**
 * `minYears === null` (no inferable requirement): score on whether the
 * Variant shows any work experience at all, rather than an exact figure.
 * `minYears === 0` (explicitly junior/entry-level): nothing required, full
 * score regardless of actual years. Otherwise: linear ramp up to the
 * requirement, capped at 100.
 */
export function scoreExperience(
  minYears: number | null,
  actualYears: number,
  workExperienceCount: number,
): number {
  if (minYears === null) {
    return workExperienceCount > 0 ? 100 : 40;
  }
  if (minYears === 0) return 100;
  if (actualYears >= minYears) return 100;
  return Math.round((actualYears / minYears) * 100);
}

// ---------------------------------------------------------------------------
// Duplicate skills / formatting problems
// ---------------------------------------------------------------------------

/** Case-insensitive duplicate detection — returns each duplicated name once, in original casing of its second (repeat) occurrence. */
export function detectDuplicateSkills(skillNames: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of skillNames) {
    const key = name.toLowerCase().trim();
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.add(name);
    }
    seen.add(key);
  }
  return [...duplicates];
}

export interface FormattingIssue {
  code: string;
  message: string;
}

const MIN_SUMMARY_LENGTH = 40;

/**
 * Structural data-quality checks on the snapshot — there is no rendered
 * document to inspect, so "formatting" here means content completeness/
 * quality signals a real ATS-adjacent review would flag.
 */
export function detectFormattingProblems(content: Record<string, unknown>): FormattingIssue[] {
  const issues: FormattingIssue[] = [];

  const summary = typeof content.summary === 'string' ? content.summary.trim() : '';
  if (summary.length < MIN_SUMMARY_LENGTH) {
    issues.push({ code: 'summary_too_short', message: 'Your Summary is too short.' });
  }

  const workExperiences = Array.isArray(content.workExperiences)
    ? (content.workExperiences as Record<string, unknown>[])
    : [];
  const hasAchievements = workExperiences.some((entry) => {
    const description = typeof entry.description === 'string' ? entry.description.trim() : '';
    const achievements = Array.isArray(entry.achievements) ? entry.achievements : [];
    return description.length > 0 || achievements.length > 0;
  });
  if (workExperiences.length > 0 && !hasAchievements) {
    issues.push({ code: 'missing_achievements', message: 'Add measurable achievements.' });
  }

  const skillNames = extractSkillNames(content);
  for (const duplicate of detectDuplicateSkills(skillNames)) {
    issues.push({ code: 'duplicate_skill', message: `Remove the duplicate skill '${duplicate}'.` });
  }

  return issues;
}

function extractSkillNames(content: Record<string, unknown>): string[] {
  const skills = Array.isArray(content.skills) ? (content.skills as Record<string, unknown>[]) : [];
  return skills.map((skill) => String(skill.name ?? '')).filter((name) => name.length > 0);
}

/** Each detected formatting issue costs 20 points off a 100 baseline, floored at 0. */
export function scoreFormatting(issues: FormattingIssue[]): number {
  return Math.max(0, 100 - issues.length * 20);
}

// ---------------------------------------------------------------------------
// Empty sections
// ---------------------------------------------------------------------------

const MAJOR_SECTIONS: Array<{ key: string; label: string }> = [
  { key: 'workExperiences', label: 'Work Experience' },
  { key: 'educations', label: 'Education' },
  { key: 'skills', label: 'Skills' },
  { key: 'languages', label: 'Languages' },
  { key: 'certificates', label: 'Certifications' },
];

export function detectEmptySections(content: Record<string, unknown>): string[] {
  return MAJOR_SECTIONS.filter(({ key }) => sectionCount(content[key]) === 0).map(
    ({ label }) => label,
  );
}

// ---------------------------------------------------------------------------
// Recommendations — deterministic, rule-based, no AI.
// ---------------------------------------------------------------------------

const MAX_LISTED_RECOMMENDATIONS_PER_CATEGORY = 5;

export interface RecommendationsInput {
  missingKeywords: string[];
  missingSkills: string[];
  formattingIssues: FormattingIssue[];
  emptySections: string[];
  experienceScore: number;
}

export function generateRecommendations(input: RecommendationsInput): string[] {
  const recommendations: string[] = [];

  for (const keyword of input.missingKeywords.slice(0, MAX_LISTED_RECOMMENDATIONS_PER_CATEGORY)) {
    recommendations.push(`Include the keyword '${keyword}' in your experience.`);
  }

  for (const issue of input.formattingIssues) {
    recommendations.push(issue.message);
  }

  for (const section of input.emptySections) {
    recommendations.push(`Complete your ${section} section.`);
  }

  for (const skill of input.missingSkills.slice(0, MAX_LISTED_RECOMMENDATIONS_PER_CATEGORY)) {
    recommendations.push(`Add the skill '${skill}' to your resume.`);
  }

  if (input.experienceScore < 100) {
    recommendations.push("You may need more experience for this role's seniority level.");
  }

  return recommendations;
}
