import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

/**
 * Phase 11 Template Engine — the catalog is a shared, read-only resource
 * (every user sees the same rows); favorites/recently-used are per-user.
 * See docs/architecture/template-engine.md.
 */
export interface TemplateMetadata {
  id: string;
  name: string;
  category: string;
  previewImage?: string | null;
  thumbnail?: string | null;
  isATSFriendly: boolean;
  premium: boolean;
  version: number;
  primaryColor: string;
  secondaryColor: string;
  font: string;
  layout: string;
  supportedSections: string[];
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
}

export interface TemplateFilters {
  category?: string;
  atsFriendly?: boolean;
  premium?: boolean;
}

function toQueryString(filters: TemplateFilters): string {
  const params = new URLSearchParams();
  if (filters.category) params.set('category', filters.category);
  if (filters.atsFriendly !== undefined) params.set('atsFriendly', String(filters.atsFriendly));
  if (filters.premium !== undefined) params.set('premium', String(filters.premium));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// Resume templates
// ---------------------------------------------------------------------------

export function useResumeTemplates(filters: TemplateFilters = {}) {
  return useQuery({
    queryKey: ['templates', 'resume', filters],
    queryFn: () => apiFetch<TemplateMetadata[]>(`/templates/resume${toQueryString(filters)}`),
  });
}

export function useResumeTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['templates', 'resume', 'detail', id],
    queryFn: () => apiFetch<TemplateMetadata>(`/templates/resume/${id}`),
    enabled: Boolean(id),
  });
}

export function useFavoriteResumeTemplates() {
  return useQuery({
    queryKey: ['templates', 'resume', 'favorites'],
    queryFn: () => apiFetch<TemplateMetadata[]>('/templates/resume/favorites'),
  });
}

export function useRecentResumeTemplates() {
  return useQuery({
    queryKey: ['templates', 'resume', 'recent'],
    queryFn: () => apiFetch<TemplateMetadata[]>('/templates/resume/recent'),
  });
}

export function useToggleResumeTemplateFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorited }: { id: string; favorited: boolean }) =>
      apiFetch<{ favorited: boolean }>(`/templates/resume/${id}/favorite`, {
        method: favorited ? 'DELETE' : 'POST',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['templates', 'resume', 'favorites'] }),
  });
}

// ---------------------------------------------------------------------------
// Cover letter templates
// ---------------------------------------------------------------------------

export function useCoverLetterTemplates(filters: TemplateFilters = {}) {
  return useQuery({
    queryKey: ['templates', 'cover-letter', filters],
    queryFn: () => apiFetch<TemplateMetadata[]>(`/templates/cover-letter${toQueryString(filters)}`),
  });
}

export function useCoverLetterTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ['templates', 'cover-letter', 'detail', id],
    queryFn: () => apiFetch<TemplateMetadata>(`/templates/cover-letter/${id}`),
    enabled: Boolean(id),
  });
}

export function useFavoriteCoverLetterTemplates() {
  return useQuery({
    queryKey: ['templates', 'cover-letter', 'favorites'],
    queryFn: () => apiFetch<TemplateMetadata[]>('/templates/cover-letter/favorites'),
  });
}

export function useRecentCoverLetterTemplates() {
  return useQuery({
    queryKey: ['templates', 'cover-letter', 'recent'],
    queryFn: () => apiFetch<TemplateMetadata[]>('/templates/cover-letter/recent'),
  });
}

export function useToggleCoverLetterTemplateFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorited }: { id: string; favorited: boolean }) =>
      apiFetch<{ favorited: boolean }>(`/templates/cover-letter/${id}/favorite`, {
        method: favorited ? 'DELETE' : 'POST',
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['templates', 'cover-letter', 'favorites'] }),
  });
}
