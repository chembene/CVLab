import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface ResumeVariant {
  id: string;
  userId: string;
  masterResumeId: string;
  jobTargetId?: string | null;
  title: string;
  version: number;
  status: string;
  archived: boolean;
  completionPercentage: number;
  content: Record<string, unknown>;
  // Phase 11 Template Engine — presentation-only, never affects `content`.
  templateId?: string | null;
  themeOverrides?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export function useResumeVariants() {
  return useQuery({
    queryKey: ['resume-variants'],
    queryFn: () => apiFetch<ResumeVariant[]>('/resume-variants'),
  });
}

export function useResumeVariant(id: string) {
  return useQuery({
    queryKey: ['resume-variants', id],
    queryFn: () => apiFetch<ResumeVariant>(`/resume-variants/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateResumeVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title: string; jobTargetId?: string; status?: string }) =>
      apiFetch<ResumeVariant>('/resume-variants', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resume-variants'] }),
  });
}

export function useUpdateResumeVariant(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; jobTargetId?: string; status?: string }) =>
      apiFetch<ResumeVariant>(`/resume-variants/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume-variants'] });
      queryClient.invalidateQueries({ queryKey: ['resume-variants', id] });
    },
  });
}

export function useDuplicateResumeVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title?: string }) =>
      apiFetch<ResumeVariant>(`/resume-variants/${id}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resume-variants'] }),
  });
}

export function useArchiveResumeVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ResumeVariant>(`/resume-variants/${id}/archive`, { method: 'PUT' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resume-variants'] }),
  });
}

export function useRestoreResumeVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ResumeVariant>(`/resume-variants/${id}/restore`, { method: 'PUT' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resume-variants'] }),
  });
}

export function useDeleteResumeVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/resume-variants/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resume-variants'] }),
  });
}

/** Phase 11 Template Engine — select which ResumeTemplate renders this Variant. */
export function useSetResumeVariantTemplate(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: string) =>
      apiFetch<ResumeVariant>(`/resume-variants/${id}/template`, {
        method: 'PUT',
        body: JSON.stringify({ templateId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume-variants'] });
      queryClient.invalidateQueries({ queryKey: ['resume-variants', id] });
      queryClient.invalidateQueries({ queryKey: ['templates', 'resume', 'recent'] });
    },
  });
}

/** Wholesale-replaces the stored theme overrides — see docs/architecture/template-engine.md §6. */
export function useUpdateResumeVariantTheme(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (themeOverrides: Record<string, unknown>) =>
      apiFetch<ResumeVariant>(`/resume-variants/${id}/theme`, {
        method: 'PUT',
        body: JSON.stringify(themeOverrides),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume-variants'] });
      queryClient.invalidateQueries({ queryKey: ['resume-variants', id] });
    },
  });
}

/** Clears all theme overrides back to the selected template's own defaults. */
export function useResetResumeVariantTheme(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<ResumeVariant>(`/resume-variants/${id}/theme`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resume-variants'] });
      queryClient.invalidateQueries({ queryKey: ['resume-variants', id] });
    },
  });
}
