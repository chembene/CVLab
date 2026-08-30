'use client';

import { useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateCard } from './TemplateCard';
import { humanizeEnum } from '@/lib/format';
import type { TemplateMetadata } from '@/lib/api/templates';

export interface TemplateGalleryProps {
  allTemplates?: TemplateMetadata[];
  favoriteTemplates?: TemplateMetadata[];
  recentTemplates?: TemplateMetadata[];
  isLoading: boolean;
  selectedTemplateId?: string | null;
  favoriteIds: Set<string>;
  onSelect: (id: string) => void;
  onPreview?: (id: string) => void;
  onToggleFavorite: (id: string, favorited: boolean) => void;
  emptyLabel?: string;
}

/**
 * Shared gallery shell for Part 7 (Resume Template Selector) and Part 8
 * (Cover Letter Template Selector) — "Same experience. Separate gallery.
 * Separate previews." is satisfied by each caller passing its own,
 * independently-fetched template lists (see ResumeTemplateGallery /
 * CoverLetterTemplateGallery) rather than this component reaching into a
 * shared data source.
 */
export function TemplateGallery({
  allTemplates,
  favoriteTemplates,
  recentTemplates,
  isLoading,
  selectedTemplateId,
  favoriteIds,
  onSelect,
  onPreview,
  onToggleFavorite,
  emptyLabel = 'Nenhum modelo encontrado.',
}: TemplateGalleryProps) {
  const [category, setCategory] = useState<string>('all');

  const categories = useMemo(() => {
    const set = new Set((allTemplates ?? []).map((t) => t.category));
    return Array.from(set).sort();
  }, [allTemplates]);

  const filtered = useMemo(() => {
    if (category === 'all') return allTemplates ?? [];
    return (allTemplates ?? []).filter((t) => t.category === category);
  }, [allTemplates, category]);

  function renderGrid(list: TemplateMetadata[] | undefined) {
    if (isLoading) {
      return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <Skeleton key={i} className="aspect-[3/4] w-full" />
          ))}
        </div>
      );
    }
    if (!list || list.length === 0) {
      return <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
    }
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {list.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            selected={template.id === selectedTemplateId}
            favorited={favoriteIds.has(template.id)}
            onSelect={onSelect}
            onPreview={onPreview}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    );
  }

  return (
    <Tabs defaultValue="all" className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="favorites">Favoritos</TabsTrigger>
          <TabsTrigger value="recent">Usados recentemente</TabsTrigger>
        </TabsList>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {humanizeEnum(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <TabsContent value="all" className="mt-4">
        {renderGrid(filtered)}
      </TabsContent>
      <TabsContent value="favorites" className="mt-4">
        {renderGrid(favoriteTemplates)}
      </TabsContent>
      <TabsContent value="recent" className="mt-4">
        {renderGrid(recentTemplates)}
      </TabsContent>
    </Tabs>
  );
}
