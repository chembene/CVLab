import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { SectionItem, SectionType } from '@/lib/section-fields';

export interface MasterResume {
  id: string;
  userId: string;
  title?: string | null;
  summary?: string | null;
  careerLevel?: string | null;
  yearsExperience?: number | null;
  desiredPosition?: string | null;
  desiredSalary?: number | null;
  currency?: string | null;
  visibility?: string | null;
  status?: string | null;
  completionPercentage: number;
  createdAt: string;
  updatedAt: string;
}

export type MasterResumeInput = Partial<
  Omit<MasterResume, 'id' | 'userId' | 'completionPercentage' | 'createdAt' | 'updatedAt'>
>;

export function useMasterResume() {
  return useQuery({
    queryKey: ['master-resume'],
    queryFn: () => apiFetch<MasterResume | null>('/resume').catch(() => null),
  });
}

export function useCreateMasterResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MasterResumeInput) =>
      apiFetch<MasterResume>('/resume', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: (data) => queryClient.setQueryData(['master-resume'], data),
  });
}

export function useUpdateMasterResume() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MasterResumeInput) =>
      apiFetch<MasterResume>('/resume', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (data) => queryClient.setQueryData(['master-resume'], data),
  });
}

export function useSection(type: SectionType) {
  return useQuery({
    queryKey: ['resume-section', type],
    queryFn: () => apiFetch<SectionItem[]>(`/resume/${type}`),
  });
}

export function useCreateSectionItem(type: SectionType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      apiFetch<SectionItem>(`/resume/${type}`, { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resume-section', type] }),
  });
}

export function useUpdateSectionItem(type: SectionType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      apiFetch<SectionItem>(`/resume/${type}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resume-section', type] }),
  });
}

export function useDeleteSectionItem(type: SectionType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/resume/${type}/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resume-section', type] }),
  });
}
