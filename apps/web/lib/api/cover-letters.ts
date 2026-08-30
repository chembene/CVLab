import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CoverLetterStatus, CoverLetterTone } from '@cvlab/types';
import { apiFetch } from '@/lib/api-client';

export interface CoverLetter {
  id: string;
  userId: string;
  resumeVariantId: string;
  jobTargetId: string;
  optimizationId?: string | null;
  title: string;
  content: string;
  tone: CoverLetterTone;
  language: string;
  version: number;
  status: CoverLetterStatus;
  creditsUsed: number;
  generatedByAI: boolean;
  // Phase 11 Template Engine — presentation-only, never affects `content`.
  templateId?: string | null;
  themeOverrides?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateCoverLetterInput {
  resumeVariantId: string;
  tone: CoverLetterTone;
  language: string;
  optimizationId?: string;
}

export function useCoverLetters() {
  return useQuery({
    queryKey: ['cover-letters'],
    queryFn: () => apiFetch<CoverLetter[]>('/cover-letter'),
  });
}

export function useCoverLetter(id: string) {
  return useQuery({
    queryKey: ['cover-letters', id],
    queryFn: () => apiFetch<CoverLetter>(`/cover-letter/${id}`),
    enabled: Boolean(id),
  });
}

export function useGenerateCoverLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateCoverLetterInput) =>
      apiFetch<CoverLetter>('/cover-letter/generate', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cover-letters'] }),
  });
}

export function useUpdateCoverLetter(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Pick<CoverLetter, 'title' | 'content' | 'tone' | 'language'>>) =>
      apiFetch<CoverLetter>(`/cover-letter/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-letters'] });
      queryClient.invalidateQueries({ queryKey: ['cover-letters', id] });
    },
  });
}

export function useRegenerateCoverLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CoverLetter>(`/cover-letter/${id}/regenerate`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cover-letters'] }),
  });
}

export function useDuplicateCoverLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CoverLetter>(`/cover-letter/${id}/duplicate`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cover-letters'] }),
  });
}

export function useArchiveCoverLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CoverLetter>(`/cover-letter/${id}/archive`, { method: 'PUT' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cover-letters'] }),
  });
}

export function useRestoreCoverLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<CoverLetter>(`/cover-letter/${id}/restore`, { method: 'PUT' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cover-letters'] }),
  });
}

export function useDeleteCoverLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/cover-letter/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cover-letters'] }),
  });
}

/** Phase 11 Template Engine — select which CoverLetterTemplate renders this letter. */
export function useSetCoverLetterTemplate(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      apiFetch<CoverLetter>(`/cover-letter/${id}/template`, {
        method: 'PUT',
        body: JSON.stringify({ templateId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-letters'] });
      queryClient.invalidateQueries({ queryKey: ['cover-letters', id] });
      queryClient.invalidateQueries({ queryKey: ['templates', 'cover-letter', 'recent'] });
    },
  });
}

export function useUpdateCoverLetterTheme(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (themeOverrides: Record<string, unknown>) =>
      apiFetch<CoverLetter>(`/cover-letter/${id}/theme`, {
        method: 'PUT',
        body: JSON.stringify(themeOverrides),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-letters'] });
      queryClient.invalidateQueries({ queryKey: ['cover-letters', id] });
    },
  });
}

export function useResetCoverLetterTheme(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<CoverLetter>(`/cover-letter/${id}/theme`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cover-letters'] });
      queryClient.invalidateQueries({ queryKey: ['cover-letters', id] });
    },
  });
}
