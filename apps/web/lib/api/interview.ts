import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  InterviewDifficulty,
  InterviewMode,
  InterviewStatus,
  InterviewType,
  QuestionCategory,
} from '@cvlab/types';
import { apiFetch } from '@/lib/api-client';

export interface InterviewAnswer {
  id: string;
  questionId: string;
  answer: string;
  score?: number | null;
  feedback?: string | null;
  strengths: string[];
  improvements: string[];
  createdAt: string;
}

export interface InterviewQuestion {
  id: string;
  sessionId: string;
  order: number;
  category: QuestionCategory;
  question: string;
  idealAnswer: string;
  tips: string;
  answer: InterviewAnswer | null;
  createdAt: string;
}

export interface InterviewSession {
  id: string;
  userId: string;
  mode: InterviewMode;
  /** Mode RESUME: always set. Mode JOB: set only when a Job Target was supplied. Mode ROLE: always null. */
  resumeVariantId: string | null;
  jobTargetId: string | null;
  /** Mode JOB only — pasted vacancy text. Null in modes RESUME/ROLE. */
  jobDescription?: string | null;
  /** Mode ROLE only. Null in modes RESUME/JOB. */
  role?: string | null;
  industry?: string | null;
  yearsExperience?: number | null;
  companyName?: string | null;
  optimizationId?: string | null;
  coverLetterId?: string | null;
  type: InterviewType;
  difficulty: InterviewDifficulty;
  language: string;
  overallScore?: number | null;
  communicationScore?: number | null;
  technicalScore?: number | null;
  confidenceScore?: number | null;
  status: InterviewStatus;
  startedAt: string;
  completedAt?: string | null;
  questions: InterviewQuestion[];
  createdAt: string;
  updatedAt: string;
}

/**
 * FASE 11 — one shape for all 3 modes, mirroring StartInterviewDto exactly:
 * only shape-level typing lives here (all mode-specific fields optional) —
 * which combination is actually required/forbidden per mode is decided by
 * the API (InterviewService.start()), never duplicated as frontend business
 * logic. See the "Nova sessão de entrevista" form in
 * app/dashboard/interviews/page.tsx.
 */
export interface StartInterviewInput {
  mode: InterviewMode;
  resumeVariantId?: string;
  jobTargetId?: string;
  jobDescription?: string;
  role?: string;
  industry?: string;
  yearsExperience?: number;
  companyName?: string;
  type: InterviewType;
  difficulty: InterviewDifficulty;
  language: string;
  optimizationId?: string;
  coverLetterId?: string;
}

export function useInterviews() {
  return useQuery({
    queryKey: ['interviews'],
    queryFn: () => apiFetch<InterviewSession[]>('/interview'),
  });
}

export function useInterview(id: string) {
  return useQuery({
    queryKey: ['interviews', id],
    queryFn: () => apiFetch<InterviewSession>(`/interview/${id}`),
    enabled: Boolean(id),
  });
}

export function useStartInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StartInterviewInput) =>
      apiFetch<InterviewSession>('/interview/start', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interviews'] }),
  });
}

export function useGenerateInterviewQuestions(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (questionCount?: number) =>
      apiFetch<InterviewSession>(`/interview/${id}/questions`, {
        method: 'POST',
        body: JSON.stringify(questionCount ? { questionCount } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interviews', id] });
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
    },
  });
}

export function useSubmitInterviewAnswer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { questionId: string; answer: string }) =>
      apiFetch<InterviewAnswer>(`/interview/${id}/answer`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interviews', id] }),
  });
}

export function useEvaluateInterview(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<InterviewSession>(`/interview/${id}/evaluate`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interviews', id] });
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
    },
  });
}

export function useDeleteInterview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/interview/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interviews'] }),
  });
}
