import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { JobTargetStatus } from '@cvlab/types';
import { apiFetch } from '@/lib/api-client';

export interface JobTargetKeyword {
  id: string;
  keyword: string;
}
export interface JobTargetSkill {
  id: string;
  skill: string;
  required: boolean;
}
export interface JobTargetLanguage {
  id: string;
  language: string;
}

export interface JobTarget {
  id: string;
  userId: string;
  title: string;
  company?: string | null;
  location?: string | null;
  employmentType?: string | null;
  seniority?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  currency: string;
  jobUrl?: string | null;
  jobDescription?: string | null;
  source?: string | null;
  status: JobTargetStatus;
  notes?: string | null;
  keywords: JobTargetKeyword[];
  skills: JobTargetSkill[];
  languages: JobTargetLanguage[];
  createdAt: string;
  updatedAt: string;
}

export interface JobTargetInput {
  title: string;
  company?: string;
  location?: string;
  employmentType?: string;
  seniority?: string;
  salaryMin?: number;
  salaryMax?: number;
  currency?: string;
  jobUrl?: string;
  jobDescription?: string;
  source?: string;
  status?: JobTargetStatus;
  notes?: string;
  keywords?: { keyword: string }[];
  skills?: { skill: string; required: boolean }[];
  languages?: { language: string }[];
}

export function useJobTargets() {
  return useQuery({
    queryKey: ['job-targets'],
    queryFn: () => apiFetch<JobTarget[]>('/job-targets'),
  });
}

export function useJobTarget(id: string) {
  return useQuery({
    queryKey: ['job-targets', id],
    queryFn: () => apiFetch<JobTarget>(`/job-targets/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateJobTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: JobTargetInput) =>
      apiFetch<JobTarget>('/job-targets', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-targets'] }),
  });
}

export function useUpdateJobTarget(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<JobTargetInput>) =>
      apiFetch<JobTarget>(`/job-targets/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-targets'] });
      queryClient.invalidateQueries({ queryKey: ['job-targets', id] });
    },
  });
}

export function useDeleteJobTarget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/job-targets/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-targets'] }),
  });
}
