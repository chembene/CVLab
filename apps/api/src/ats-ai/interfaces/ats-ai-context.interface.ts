import type { SuggestionPriority } from '@prisma/client';

/**
 * The context AtsAiService assembles before calling AiOrchestrationService —
 * built entirely from the already-persisted, deterministic AtsReport (Phase
 * 4) plus its already-linked Job Target. No keyword matching, scoring, or
 * parsing is recomputed here — every number/list below is read verbatim
 * from AtsReport, never recalculated. See ats-ai-engine.md §2-3.
 */
export interface AtsAiContext {
  atsReport: {
    overallScore: number;
    keywordScore: number;
    skillsScore: number;
    experienceScore: number;
    educationScore: number;
    languageScore: number;
    formattingScore: number;
    completionScore: number;
    matchedKeywords: string[];
    missingKeywords: string[];
    recommendedSkills: string[];
    recommendations: string[];
  };
  /** AtsReport.jobTargetId is non-nullable — a report can never exist without a linked Job Target (AtsAnalysisService.run() enforces this at creation time) — so this is always present, never optional, unlike every other context field across the AI features built so far. */
  jobTarget: {
    title: string;
    company: string | null;
    seniority: string | null;
    keywords: string[];
    skills: string[];
    languages: string[];
  };
  /**
   * Light résumé context — title only, never the full content JSON blob
   * (that's Resume Optimization's job, not this feature's — see
   * ats-ai-engine.md §3 for why). AtsReport.resumeVariantId is also
   * non-nullable (same guarantee as jobTargetId above), so this is always
   * present too.
   */
  resume: {
    title: string;
  };
}

/**
 * The lightweight, persisted record of what fed a given analysis — counts
 * only, never the underlying content. Stored as
 * AtsAiAnalysis.contextSnapshot. Mirrors CareerAdviceContextSnapshot's/
 * LinkedInProfileContextSnapshot's exact rationale. No `hasJobTarget`/
 * `hasResume` booleans here (unlike those two) — both are always true for
 * ATS AI, since AtsReport.jobTargetId/resumeVariantId are non-nullable; a
 * boolean that never varies would carry no information.
 */
export interface AtsAiContextSnapshot {
  matchedKeywordsCount: number;
  missingKeywordsCount: number;
  recommendedSkillsCount: number;
}

export interface AtsAiRecommendation {
  priority: SuggestionPriority;
  category: string;
  explanation: string;
  recommendation: string;
}
