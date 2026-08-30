import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface HistoryEvent {
  id: string;
  userId: string;
  eventType: string;
  entityRef?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * `GET /history` has no controller yet — every backend phase so far has
 * written to `history_events` (via HistoryListener) but nothing reads it
 * back over HTTP (see docs/architecture/api-overview.md's History row,
 * "not implemented — endpoint not yet built"). This hook is written against
 * the shape that endpoint will return so wiring it up later is a one-line
 * change; until then the History page falls back to mock data — see
 * app/dashboard/history/page.tsx.
 */
export function useHistoryEvents() {
  return useQuery({
    queryKey: ['history'],
    queryFn: () => apiFetch<HistoryEvent[]>('/history'),
    retry: false,
  });
}
