import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

/** Mirrors AIFeature.TEMPLATE_RECOMMENDATION's string value in apps/api/src/ai-orchestration/constants/ai-feature.enum.ts — no shared enum package exists across the API/web boundary yet (same as every other featureKey used so far, e.g. career-advisor.ts/linkedin.ts/ats-ai.ts), so this is kept in sync by hand. */
export const TEMPLATE_RECOMMENDATION_FEATURE_KEY = 'template_recommendation';

export interface TemplateRecommendationItem {
  templateId: string;
  rank: number;
  score: number;
  reason: string;
}

export interface TemplateRecommendationContextSnapshot {
  hasMasterResume: boolean;
  hasResumeVariant: boolean;
  hasJobTarget: boolean;
  workExperienceCount: number;
  educationCount: number;
  skillsCount: number;
  availableTemplatesCount: number;
}

export interface TemplateRecommendation {
  id: string;
  userId: string;
  resumeVariantId: string | null;
  jobTargetId: string | null;
  summary: string;
  recommendations: TemplateRecommendationItem[];
  contextSnapshot: TemplateRecommendationContextSnapshot | null;
  creditsUsed: number;
  aiRequestId: string | null;
  createdAt: string;
}

export interface CreateTemplateRecommendationInput {
  resumeVariantId?: string;
  jobTargetId?: string;
}

export function useTemplateRecommendationHistory() {
  return useQuery({
    queryKey: ['template-recommendations'],
    queryFn: () => apiFetch<TemplateRecommendation[]>('/template-recommendations'),
  });
}

export function useGenerateTemplateRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateRecommendationInput) =>
      apiFetch<TemplateRecommendation>('/template-recommendations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-recommendations'] });
      // Credits were just charged — refresh the wallet balance shown
      // elsewhere in the app (e.g. the sidebar/credits page).
      queryClient.invalidateQueries({ queryKey: ['credits', 'wallet'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'estimate'] });
    },
  });
}
