import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface AtsReport {
  id: string;
  userId: string;
  resumeVariantId: string;
  jobTargetId: string;
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
  createdAt: string;
  updatedAt: string;
}

export function useAtsReports() {
  return useQuery({
    queryKey: ['ats-reports'],
    queryFn: () => apiFetch<AtsReport[]>('/ats/reports'),
  });
}

export function useAtsReport(id: string) {
  return useQuery({
    queryKey: ['ats-reports', id],
    queryFn: () => apiFetch<AtsReport>(`/ats/reports/${id}`),
    enabled: Boolean(id),
  });
}

export function useRunAtsAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resumeVariantId: string) =>
      apiFetch<AtsReport>('/ats/run', {
        method: 'POST',
        body: JSON.stringify({ resumeVariantId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ats-reports'] }),
  });
}

export function useDeleteAtsReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/ats/reports/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ats-reports'] }),
  });
}
