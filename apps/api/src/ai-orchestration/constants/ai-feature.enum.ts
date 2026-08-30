/**
 * Every AI-consuming feature the orchestration engine knows how to route.
 * Values are the exact strings used as `feature_pricing.featureKey` and
 * `ai_requests.feature` — a future seed script must use these same keys
 * (see docs/architecture/ai-orchestration.md "Feature Keys"). `ATS_AI` is
 * deliberately distinct from Phase 4's deterministic `ats_reports` engine —
 * it is the future AI-assisted ATS suggestion feature that
 * `JobTargetAnalysisService.calculateATS()` (Phase 2B stub) anticipates, not
 * a replacement for the rule-based one.
 */
export enum AIFeature {
  ATS_AI = 'ats_ai',
  RESUME_OPTIMIZATION = 'resume_optimization',
  COVER_LETTER = 'cover_letter',
  // Generic placeholder from Phase 6 — deliberately left unregistered/dormant.
  // Interview Preparation (Phase 9) uses the two more specific values below
  // instead, since AI Orchestration's PromptRegistry maps exactly one
  // PromptBuilder per AIFeature key, and question generation and answer
  // evaluation are genuinely two distinct prompts/parsers/price points.
  INTERVIEW = 'interview',
  // Mode RESUME (FASE 11) — CV + Job Target, both required. 30/30 credits.
  INTERVIEW_QUESTIONS = 'interview_questions',
  INTERVIEW_EVALUATION = 'interview_evaluation',
  // FASE 11 — Mode JOB (Job Target and/or free-text job description; CV
  // optional). 25/25 credits — same reasoning as INTERVIEW_QUESTIONS/
  // INTERVIEW_EVALUATION's own split: PromptRegistry/CreditService both key
  // 1:1 off AIFeature, so a genuinely different price point per mode needs
  // its own key rather than a parametrized-price mechanism this codebase
  // has no other precedent for.
  INTERVIEW_QUESTIONS_JOB = 'interview_questions_job',
  INTERVIEW_EVALUATION_JOB = 'interview_evaluation_job',
  // FASE 11 — Mode ROLE (role/title only; no CV, no Job Target). 20/20 credits.
  INTERVIEW_QUESTIONS_ROLE = 'interview_questions_role',
  INTERVIEW_EVALUATION_ROLE = 'interview_evaluation_role',
  CAREER_ADVISOR = 'career_advisor',
  LINKEDIN = 'linkedin',
  // Phase 10.5 — CV Import Engine's "AI Extraction" step (structuring raw
  // parsed text into typed resume sections) and Template Engine's
  // recommendation step.
  CV_IMPORT = 'cv_import',
  TEMPLATE_RECOMMENDATION = 'template_recommendation',
}
