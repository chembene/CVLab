'use client';

import {
  useCoverLetterTemplates,
  useFavoriteCoverLetterTemplates,
  useRecentCoverLetterTemplates,
  useToggleCoverLetterTemplateFavorite,
} from '@/lib/api/templates';
import { TemplateGallery } from './TemplateGallery';

export interface CoverLetterTemplateGalleryProps {
  selectedTemplateId?: string | null;
  onSelect: (id: string) => void;
  onPreview?: (id: string) => void;
}

/** Part 8 "Cover Letter Template Selector" — same experience as the Resume gallery, separate data source. */
export function CoverLetterTemplateGallery({
  selectedTemplateId,
  onSelect,
  onPreview,
}: CoverLetterTemplateGalleryProps) {
  const { data: allTemplates, isLoading } = useCoverLetterTemplates();
  const { data: favoriteTemplates } = useFavoriteCoverLetterTemplates();
  const { data: recentTemplates } = useRecentCoverLetterTemplates();
  const toggleFavorite = useToggleCoverLetterTemplateFavorite();

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
      emptyLabel="Nenhum modelo de carta de apresentação encontrado."
    />
  );
}
