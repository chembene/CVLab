import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OptimizationStatus, SuggestionPriority, SuggestionType } from '@cvlab/types';
import { apiFetch } from '@/lib/api-client';
import type { AtsReport } from './ats';

export interface OptimizationSuggestion {
  id: string;
  optimizationId: string;
  type: SuggestionType;
  section: string;
  title: string;
  description?: string | null;
  reason?: string | null;
  priority: SuggestionPriority;
  originalText?: string | null;
  suggestedText: string;
  accepted: boolean;
  applied: boolean;
  displayOrder: number;
}

export interface ResumeOptimization {
  id: string;
  userId: string;
  resumeVariantId: string;
  jobTargetId: string;
  atsReportId: string;
  status: OptimizationStatus;
  creditsUsed: number;
  beforeScore: number;
  predictedScore?: number | null;
  summary?: string | null;
  suggestions: OptimizationSuggestion[];
  createdAt: string;
  updatedAt: string;
}

export interface ApplySuggestionsResult {
  optimization: ResumeOptimization;
  appliedSuggestionIds: string[];
  skippedSuggestionIds: string[];
  newAtsReport: AtsReport;
}

export function useOptimizations() {
  return useQuery({
    queryKey: ['optimizations'],
    queryFn: () => apiFetch<ResumeOptimization[]>('/resume-optimization'),
  });
}

export function useOptimization(id: string) {
  return useQuery({
    queryKey: ['optimizations', id],
    queryFn: () => apiFetch<ResumeOptimization>(`/resume-optimization/${id}`),
    enabled: Boolean(id),
  });
}

export function useRunOptimization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { resumeVariantId: string; force?: boolean }) =>
      apiFetch<ResumeOptimization>('/resume-optimization/run', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['optimizations'] }),
  });
}

export function useApplySuggestions(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (suggestionIds: string[]) =>
      apiFetch<ApplySuggestionsResult>(`/resume-optimization/${id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ suggestionIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['optimizations', id] });
      queryClient.invalidateQueries({ queryKey: ['resume-variants'] });
      queryClient.invalidateQueries({ queryKey: ['ats-reports'] });
    },
  });
}

export function useDeleteOptimization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/resume-optimization/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['optimizations'] }),
  });
}
