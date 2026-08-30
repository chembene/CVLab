/**
 * The optional, best-effort professional context CareerAdvisorService
 * assembles before calling AiOrchestrationService — per FASE 18's priority
 * order (profile → master resume → experience → education → skills → job
 * targets → resume variants → applications → ATS results → interview
 * history). Every field is independently optional: a user with none of this
 * data still gets a valid context object (all empty/null), never a thrown
 * error — see CareerAdvisorService.buildContext(). CareerAdvisorPromptBuilder
 * renders only the pieces that are present; nothing here is ever invented.
 */
export interface CareerAdviceContext {
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
    completionPercentage: number;
  } | null;

  /** Only fetched when masterResume is present — see ResumeSectionsService.list()'s NotFoundException when no MasterResume exists. */
  workExperience: Array<{
    position: string;
    company: string;
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
    status: string;
  }>;

  resumeVariants: Array<{
    title: string;
  }>;

  applications: Array<{
    jobTargetTitle: string;
    status: string;
  }>;

  atsReports: Array<{
    overallScore: number;
    missingKeywordsCount: number;
  }>;

  interviewSessions: Array<{
    mode: string;
    type: string;
    difficulty: string;
  }>;
}

/**
 * The lightweight, persisted record of which optional sources actually fed a
 * given piece of advice — booleans/counts only, never the underlying
 * content (that already lives in its own tables and can be re-read anytime).
 * Stored as CareerAdvice.contextSnapshot. See Decision 4 of the FASE 18
 * audit.
 */
export interface CareerAdviceContextSnapshot {
  hasProfile: boolean;
  hasMasterResume: boolean;
  workExperienceCount: number;
  educationCount: number;
  skillsCount: number;
  jobTargetsCount: number;
  resumeVariantsCount: number;
  applicationsCount: number;
  atsReportsCount: number;
  interviewSessionsCount: number;
}
