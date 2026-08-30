import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

/** Mirrors AIFeature.LINKEDIN's string value in apps/api/src/ai-orchestration/constants/ai-feature.enum.ts — no shared enum package exists across the API/web boundary yet (same as every other featureKey used so far, e.g. career-advisor.ts), so this is kept in sync by hand. */
export const LINKEDIN_FEATURE_KEY = 'linkedin';

export interface LinkedInProfileContextSnapshot {
  hasProfile: boolean;
  hasMasterResume: boolean;
  workExperienceCount: number;
  educationCount: number;
  skillsCount: number;
  jobTargetsCount: number;
}

export interface LinkedInProfile {
  id: string;
  userId: string;
  targetRole: string | null;
  headline: string;
  about: string;
  skills: string[];
  experienceSuggestions: string[];
  recommendations: string[];
  contextSnapshot: LinkedInProfileContextSnapshot | null;
  creditsUsed: number;
  aiRequestId: string | null;
  createdAt: string;
}

export function useLinkedInProfileHistory() {
  return useQuery({
    queryKey: ['linkedin', 'profile'],
    queryFn: () => apiFetch<LinkedInProfile[]>('/linkedin/profile'),
  });
}

export function useGenerateLinkedInProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetRole: string | undefined) =>
      apiFetch<LinkedInProfile>('/linkedin/profile', {
        method: 'POST',
        body: JSON.stringify(targetRole ? { targetRole } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin', 'profile'] });
      // Credits were just charged — refresh the wallet balance shown
      // elsewhere in the app (e.g. the sidebar/credits page).
      queryClient.invalidateQueries({ queryKey: ['credits', 'wallet'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'estimate'] });
    },
  });
}
