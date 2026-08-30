import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

/** Mirrors AIFeature.CAREER_ADVISOR's string value in apps/api/src/ai-orchestration/constants/ai-feature.enum.ts — no shared enum package exists across the API/web boundary yet (same as every other featureKey used so far), so this is kept in sync by hand. */
export const CAREER_ADVISOR_FEATURE_KEY = 'career_advisor';

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

export interface CareerAdvice {
  id: string;
  userId: string;
  question: string;
  summary: string;
  currentAssessment: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  nextSteps: string[];
  contextSnapshot: CareerAdviceContextSnapshot | null;
  creditsUsed: number;
  aiRequestId: string | null;
  createdAt: string;
}

export interface CreditEstimate {
  featureKey: string;
  cost: number;
  currentBalance: number;
  sufficientBalance: boolean;
  balanceAfter: number;
}

/** Reused by any future feature page that wants to show its price before submitting — see FASE 18's "credit-cost indicator" requirement (the price must never be hardcoded in the frontend). */
export function useCreditEstimate(featureKey: string) {
  return useQuery({
    queryKey: ['credits', 'estimate', featureKey],
    queryFn: () =>
      apiFetch<CreditEstimate>('/credits/estimate', {
        method: 'POST',
        body: JSON.stringify({ featureKey }),
      }),
  });
}

export function useCareerAdviceHistory() {
  return useQuery({
    queryKey: ['career-advisor', 'advice'],
    queryFn: () => apiFetch<CareerAdvice[]>('/career-advisor/advice'),
  });
}

export function useRequestCareerAdvice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (question: string) =>
      apiFetch<CareerAdvice>('/career-advisor/advice', {
        method: 'POST',
        body: JSON.stringify({ question }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['career-advisor', 'advice'] });
      // Credits were just charged — refresh the wallet balance shown
      // elsewhere in the app (e.g. the sidebar/credits page).
      queryClient.invalidateQueries({ queryKey: ['credits', 'wallet'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'estimate'] });
    },
  });
}
