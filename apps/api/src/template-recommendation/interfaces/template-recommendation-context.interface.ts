/**
 * The context TemplateRecommendationService assembles before calling
 * AiOrchestrationService — built from whatever optional sources the brief
 * lists (Resume Variant, Master Resume, Job Target, experience/education/
 * skills/languages, content structure) plus the full catalog of templates
 * the AI is allowed to recommend from. Every field except
 * `availableTemplates` is independently optional: a user with none of this
 * data still gets a valid context object, never a thrown error — see
 * TemplateRecommendationService.buildContext(). `availableTemplates` is
 * never empty by construction (the catalog always has seeded rows) and is
 * what makes the AI's output validatable afterward — see
 * template-recommendation-engine.md §2 ("the AI is never authoritative over
 * which templates exist").
 */
export interface TemplateRecommendationContext {
  masterResume: {
    title: string | null;
    summary: string | null;
    careerLevel: string | null;
    yearsExperience: number | null;
    desiredPosition: string | null;
  } | null;

  /** Only fetched when masterResume is present — see ResumeSectionsService.list()'s NotFoundException when no MasterResume exists. */
  workExperienceCount: number;
  educationCount: number;
  skillsCount: number;
  languages: string[];

  /** Present only when a resumeVariantId was given in the request. */
  resumeVariant: { title: string } | null;

  /** Present when a jobTargetId was given directly, or derivable from the given Resume Variant's own jobTargetId. */
  jobTarget: {
    title: string;
    company: string | null;
    seniority: string | null;
    employmentType: string | null;
  } | null;

  availableTemplates: Array<{
    id: string;
    name: string;
    category: string;
    isATSFriendly: boolean;
    premium: boolean;
  }>;
}

/**
 * The lightweight, persisted record of which optional sources fed a given
 * recommendation — counts/booleans only, never the underlying content.
 * Stored as TemplateRecommendation.contextSnapshot. Mirrors every prior
 * FASE's contextSnapshot rationale.
 */
export interface TemplateRecommendationContextSnapshot {
  hasMasterResume: boolean;
  hasResumeVariant: boolean;
  hasJobTarget: boolean;
  workExperienceCount: number;
  educationCount: number;
  skillsCount: number;
  availableTemplatesCount: number;
}

export interface TemplateRecommendationItem {
  templateId: string;
  rank: number;
  score: number;
  reason: string;
}
