import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

/**
 * FASE 23 — Technical Tests Engine. Mirrors
 * apps/api/src/tests/interfaces/technical-test.interface.ts — no shared
 * enum/type package exists across the API/web boundary yet, same as every
 * other feature's own hand-synced client types.
 */

/** `EXPIRED` is derived by the server from its own clock (an overdue IN_PROGRESS attempt) — the client only displays it, never computes it. */
export type TestSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export interface TechnicalTestSummary {
  id: string;
  title: string;
  category: string | null;
  timeLimit: number | null;
  questionCount: number;
}

export interface SanitizedTestQuestion {
  id: string;
  prompt: string;
  choices: string[];
  order: number;
  correctAnswer?: string;
  explanation?: string | null;
  selectedAnswer?: string | null;
  isCorrect?: boolean | null;
}

export interface TestSessionView {
  id: string;
  userId: string;
  testId: string;
  attemptNumber: number;
  status: TestSessionStatus;
  score: number | null;
  startedAt: string;
  completedAt: string | null;
  remainingSeconds: number | null;
  test: TechnicalTestSummary;
  questions: SanitizedTestQuestion[];
}

export interface TestSessionHistoryEntry {
  id: string;
  testId: string;
  testTitle: string;
  testCategory: string | null;
  attemptNumber: number;
  status: TestSessionStatus;
  score: number | null;
  startedAt: string;
  completedAt: string | null;
}

export function useTechnicalTests(category?: string) {
  return useQuery({
    queryKey: ['technical-tests', category ?? null],
    queryFn: () =>
      apiFetch<TechnicalTestSummary[]>(
        `/tests${category ? `?category=${encodeURIComponent(category)}` : ''}`,
      ),
  });
}

export function useTechnicalTest(id: string | undefined) {
  return useQuery({
    queryKey: ['technical-tests', id],
    queryFn: () => apiFetch<TechnicalTestSummary>(`/tests/${id}`),
    enabled: Boolean(id),
  });
}

export function useStartTestSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (testId: string) =>
      apiFetch<TestSessionView>(`/tests/${testId}/start`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['test-sessions'] }),
  });
}

export function useTestSession(id: string | undefined) {
  return useQuery({
    queryKey: ['test-sessions', id],
    queryFn: () => apiFetch<TestSessionView>(`/test-sessions/${id}`),
    enabled: Boolean(id),
  });
}

export function useTestSessionResult(id: string | undefined) {
  return useQuery({
    queryKey: ['test-sessions', id, 'result'],
    queryFn: () => apiFetch<TestSessionView>(`/test-sessions/${id}/result`),
    enabled: Boolean(id),
  });
}

export function useTestSessionHistory() {
  return useQuery({
    queryKey: ['test-sessions'],
    queryFn: () => apiFetch<TestSessionHistoryEntry[]>('/test-sessions'),
  });
}

export interface SubmitTestAnswerInput {
  questionId: string;
  selectedAnswer?: string | null;
}

export function useSubmitTestAnswer(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitTestAnswerInput) =>
      apiFetch<TestSessionView>(`/test-sessions/${sessionId}/answer`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => queryClient.setQueryData(['test-sessions', sessionId], data),
  });
}

export function useCompleteTestSession(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<TestSessionView>(`/test-sessions/${sessionId}/complete`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.setQueryData(['test-sessions', sessionId], data);
      queryClient.invalidateQueries({ queryKey: ['test-sessions'] });
    },
  });
}
