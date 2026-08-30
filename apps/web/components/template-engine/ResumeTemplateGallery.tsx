'use client';

import {
  useResumeTemplates,
  useFavoriteResumeTemplates,
  useRecentResumeTemplates,
  useToggleResumeTemplateFavorite,
} from '@/lib/api/templates';
import { TemplateGallery } from './TemplateGallery';

export interface ResumeTemplateGalleryProps {
  selectedTemplateId?: string | null;
  onSelect: (id: string) => void;
  onPreview?: (id: string) => void;
}

/** Part 7 "Resume Template Selector" — visual gallery over the 10 built-in Resume Templates. */
export function ResumeTemplateGallery({
  selectedTemplateId,
  onSelect,
  onPreview,
}: ResumeTemplateGalleryProps) {
  const { data: allTemplates, isLoading } = useResumeTemplates();
  const { data: favoriteTemplates } = useFavoriteResumeTemplates();
  const { data: recentTemplates } = useRecentResumeTemplates();
  const toggleFavorite = useToggleResumeTemplateFavorite();

  const favoriteIds = new Set((favoriteTemplates ?? []).map((t) => t.id));

  return (
    <TemplateGallery
      allTemplates={allTemplates}
      favoriteTemplates={favoriteTemplates}
      recentTemplates={recentTemplates}
      isLoading={isLoading}
      selectedTemplateId={selectedTemplateId}
      favoriteIds={favoriteIds}
      onSelect={onSelect}
      onPreview={onPreview}
      onToggleFavorite={(id, favorited) => toggleFavorite.mutate({ id, favorited })}
      emptyLabel="Nenhum modelo de currículo encontrado."
    />
  );
}
