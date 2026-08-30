import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SuggestionPriority } from '@cvlab/types';
import { apiFetch } from '@/lib/api-client';

/** Mirrors AIFeature.ATS_AI's string value in apps/api/src/ai-orchestration/constants/ai-feature.enum.ts — no shared enum package exists across the API/web boundary yet (same as every other featureKey used so far, e.g. career-advisor.ts/linkedin.ts), so this is kept in sync by hand. */
export const ATS_AI_FEATURE_KEY = 'ats_ai';

export interface AtsAiRecommendation {
  /** Reuses Resume Optimization's own priority vocabulary/enum (same values the backend's AtsAiResponseParser validates against, via @prisma/client's SuggestionPriority) — see components/priority-badge.tsx, reused as-is below rather than a new badge/vocabulary. */
  priority: SuggestionPriority;
  category: string;
  explanation: string;
  recommendation: string;
}

export interface AtsAiContextSnapshot {
  matchedKeywordsCount: number;
  missingKeywordsCount: number;
  recommendedSkillsCount: number;
}

export interface AtsAiAnalysis {
  id: string;
  userId: string;
  atsReportId: string;
  overallAssessment: string;
  strengths: string[];
  priorityIssues: AtsAiRecommendation[];
  contentRecommendations: AtsAiRecommendation[];
  sectionRecommendations: AtsAiRecommendation[];
  actionPlan: string[];
  contextSnapshot: AtsAiContextSnapshot | null;
  creditsUsed: number;
  aiRequestId: string | null;
  createdAt: string;
}

export function useAtsAiAnalyses() {
  return useQuery({
    queryKey: ['ats-ai', 'analyses'],
    queryFn: () => apiFetch<AtsAiAnalysis[]>('/ats-ai/analyses'),
  });
}

export function useAnalyzeWithAi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (atsReportId: string) =>
      apiFetch<AtsAiAnalysis>('/ats-ai/analyze', {
        method: 'POST',
        body: JSON.stringify({ atsReportId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ats-ai', 'analyses'] });
      // Credits were just charged — refresh the wallet balance shown
      // elsewhere in the app (e.g. the sidebar/credits page).
      queryClient.invalidateQueries({ queryKey: ['credits', 'wallet'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'estimate'] });
    },
  });
}
