import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApplicationStatus } from '@cvlab/types';
import { apiFetch } from '@/lib/api-client';

/**
 * Client for the Application Tracker's own CRUD. No `GET /applications/:id`
 * exists on the backend (deliberately, since Phase 2B) and this phase's
 * approved decision is not to add one — the detail page derives a single
 * Application from this same list query's cache instead (see
 * app/dashboard/applications/[id]/page.tsx). No Job Target/Resume Variant
 * data is embedded here either — the backend never joins them (no other
 * list endpoint in this project does), so pages that need that context
 * cross-reference with the already-existing useJobTargets()/
 * useResumeVariants() list hooks entirely client-side.
 */
export interface Application {
  id: string;
  userId: string;
  jobTargetId: string;
  resumeVariantId?: string | null;
  resumeVariantVersionId?: string | null;
  status: ApplicationStatus;
  appliedAt?: string | null;
  interviewDate?: string | null;
  result?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Mirrors UpdateApplicationDto — jobTargetId is intentionally excluded (an application binds permanently to the job target it was created for; the backend rejects moving it). */
export interface UpdateApplicationInput {
  resumeVariantId?: string;
  status?: ApplicationStatus;
  appliedAt?: string;
  interviewDate?: string;
  result?: string;
  notes?: string;
}

export function useApplications() {
  return useQuery({
    queryKey: ['applications'],
    queryFn: () => apiFetch<Application[]>('/applications'),
  });
}

export function useUpdateApplication(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateApplicationInput) =>
      apiFetch<Application>(`/applications/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/applications/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['applications'] }),
  });
}
