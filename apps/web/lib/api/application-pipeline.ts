import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApplicationPipelineStatus,
  ApplicationPipelineStep,
  ApplicationStatus,
  CoverLetterTone,
  InterviewDifficulty,
  InterviewType,
} from '@cvlab/types';
import { apiFetch, getAccessToken, ApiError } from '@/lib/api-client';
import { downloadBlob, type ExportFormat } from './export';
import type { Application } from './applications';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export interface ApplicationPipelineSession {
  id: string;
  userId: string;
  resumeVariantId: string;
  jobTargetId: string;
  atsReportId?: string | null;
  optimizationId?: string | null;
  newAtsReportId?: string | null;
  coverLetterId?: string | null;
  interviewSessionId?: string | null;
  exportedDocumentId?: string | null;
  applicationId?: string | null;
  currentStep: ApplicationPipelineStep;
  status: ApplicationPipelineStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

const KEY = (id: string) => ['application-pipeline', id];

export function usePipelineSessions() {
  return useQuery({
    queryKey: ['application-pipeline'],
    queryFn: () => apiFetch<ApplicationPipelineSession[]>('/application-pipeline'),
  });
}

export function usePipelineSession(id: string | undefined) {
  return useQuery({
    queryKey: KEY(id ?? ''),
    queryFn: () => apiFetch<ApplicationPipelineSession>(`/application-pipeline/${id}`),
    enabled: Boolean(id),
  });
}

export function useStartPipeline() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { resumeVariantId: string; jobTargetId: string }) =>
      apiFetch<ApplicationPipelineSession>('/application-pipeline', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['application-pipeline'] }),
  });
}

function useStep<TInput = void>(id: string, path: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) =>
      apiFetch<ApplicationPipelineSession>(`/application-pipeline/${id}/steps/${path}`, {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY(id) }),
  });
}

export function useRunAtsStep(id: string) {
  return useStep<void>(id, 'ats');
}

export function useRunOptimizationStep(id: string) {
  return useStep<{ force?: boolean }>(id, 'optimization');
}

export function useApplySuggestionsStep(id: string) {
  return useStep<{ suggestionIds: string[] }>(id, 'apply-suggestions');
}

export function useGenerateCoverLetterStep(id: string) {
  return useStep<{ tone: CoverLetterTone; language: string }>(id, 'cover-letter');
}

export function useStartInterviewStep(id: string) {
  return useStep<{ type: InterviewType; difficulty: InterviewDifficulty; language: string }>(
    id,
    'interview',
  );
}

export function useFinalizeStep(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { status?: ApplicationStatus; notes?: string }) =>
      apiFetch<{ session: ApplicationPipelineSession; application: Application }>(
        `/application-pipeline/${id}/steps/finalize`,
        { method: 'POST', body: JSON.stringify(input) },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY(id) });
      queryClient.invalidateQueries({ queryKey: ['applications'] });
    },
  });
}

export function useAbandonPipeline(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<ApplicationPipelineSession>(`/application-pipeline/${id}/abandon`, {
        method: 'PUT',
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY(id) }),
  });
}

/**
 * The export step is a binary response, exactly like POST /exports/resume —
 * bypasses apiFetch() (which always calls response.json()) for the same
 * reason lib/api/export.ts does. Downloads the file AND returns the
 * refreshed session (advanced to FINALIZE) so the wizard can move on
 * without a second round trip.
 */
export function useExportPipelineStep(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (format: ExportFormat) => {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      const token = getAccessToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);

      const response = await fetch(
        `${API_BASE_URL}/api/v1/application-pipeline/${id}/steps/export`,
        {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ format }),
        },
      );

      if (!response.ok) {
        let message = 'Não foi possível gerar o ficheiro.';
        try {
          const body = await response.json();
          if (!body.success) message = body.error.message;
        } catch {
          // Non-JSON error body — fall back to the generic message above.
        }
        throw new ApiError(message, response.status);
      }

      const blob = await response.blob();
      const match = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/);
      const fileName = match?.[1] ?? (format === 'PDF' ? 'curriculo.pdf' : 'curriculo.docx');
      downloadBlob(blob, fileName);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY(id) }),
  });
}
