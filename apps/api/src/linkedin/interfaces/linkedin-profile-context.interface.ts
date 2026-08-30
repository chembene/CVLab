/**
 * The optional, best-effort professional context LinkedInService assembles
 * before calling AiOrchestrationService — per FASE 19's brief: Profile
 * (location), Master Resume, its work-experience/education/skills sections,
 * and Job Targets (optional, used to infer a target role when none was
 * given explicitly). Every field is independently optional: a user with
 * none of this data still gets a valid context object (all empty/null),
 * never a thrown error — see LinkedInService.buildContext(). Deliberately
 * narrower than CareerAdviceContext (FASE 18) — no Applications/ATS
 * Reports/Interview history, matching this feature's own scope as briefed.
 */
export interface LinkedInProfileContext {
  profile: {
    firstName: string | null;
    lastName: string | null;
    headline: string | null;
    city: string | null;
    country: string | null;
  } | null;

  masterResume: {
    title: string | null;
    summary: string | null;
    careerLevel: string | null;
    yearsExperience: number | null;
    desiredPosition: string | null;
  } | null;

  /** Only fetched when masterResume is present — see ResumeSectionsService.list()'s NotFoundException when no MasterResume exists. */
  workExperience: Array<{
    position: string;
    company: string;
    description: string | null;
    achievements: string[];
    currentlyWorking: boolean;
  }>;
  education: Array<{
    degree: string | null;
    institution: string;
    field: string | null;
  }>;
  skills: Array<{
    name: string;
    level: string | null;
  }>;

  jobTargets: Array<{
    title: string;
    company: string | null;
  }>;
}

/**
 * The lightweight, persisted record of which optional sources actually fed
 * a given LinkedIn profile generation — booleans/counts only, never the
 * underlying content (that already lives in its own tables and can be
 * re-read anytime). Stored as LinkedInProfile.contextSnapshot. Mirrors
 * CareerAdviceContextSnapshot's exact rationale (FASE 18).
 */
export interface LinkedInProfileContextSnapshot {
  hasProfile: boolean;
  hasMasterResume: boolean;
  workExperienceCount: number;
  educationCount: number;
  skillsCount: number;
  jobTargetsCount: number;
}
