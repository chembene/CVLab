/**
 * The 8 resume sections ResumeSuggestionApplier knows how to write to,
 * mapped to the content key inside a ResumeVariant's `content` JSONB
 * snapshot (see resume-variant-snapshot.util.ts's SECTION_TYPE_TO_CONTENT_KEY
 * for the analogous mapping on the Master Resume side). A suggestion whose
 * `section` isn't one of these keys is accepted but never applied — see
 * ResumeSuggestionApplier.
 */
export const SUPPORTED_OPTIMIZATION_SECTIONS = [
  'summary',
  'experience',
  'skills',
  'projects',
  'education',
  'languages',
  'certifications',
  'achievements',
] as const;

export type SupportedOptimizationSection = (typeof SUPPORTED_OPTIMIZATION_SECTIONS)[number];

export function isSupportedOptimizationSection(
  section: string,
): section is SupportedOptimizationSection {
  return (SUPPORTED_OPTIMIZATION_SECTIONS as readonly string[]).includes(section);
}

/** Content key inside ResumeVariant.content for each supported section. 'summary' is the one scalar field; every other section is an array. */
export const SECTION_CONTENT_KEY: Record<SupportedOptimizationSection, string> = {
  summary: 'summary',
  experience: 'workExperiences',
  skills: 'skills',
  projects: 'projects',
  education: 'educations',
  languages: 'languages',
  certifications: 'certificates',
  achievements: 'awards',
};

/** For array sections, the primary free-text field a suggestion's originalText/suggestedText targets — sourced from each section entity's Prisma model (WorkExperience.description, Skill.name, Project.description, Education.description, Language.language, Certificate.title, Award.description). */
export const ARRAY_SECTION_PRIMARY_FIELD: Record<
  Exclude<SupportedOptimizationSection, 'summary'>,
  string
> = {
  experience: 'description',
  skills: 'name',
  projects: 'description',
  education: 'description',
  languages: 'language',
  certifications: 'title',
  achievements: 'description',
};
