'use client';

import { Star, Check, ShieldCheck, Crown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TemplateSwatch } from './TemplateSwatch';
import { humanizeEnum } from '@/lib/format';
import type { TemplateMetadata } from '@/lib/api/templates';
import { cn } from '@/lib/utils';

export interface TemplateCardProps {
  template: TemplateMetadata;
  selected: boolean;
  favorited: boolean;
  onSelect: (id: string) => void;
  onPreview?: (id: string) => void;
  onToggleFavorite: (id: string, favorited: boolean) => void;
}

/**
 * Part 7/8 "Template Card" — thumbnail, name, ATS badge, description
 * (derived from category), recommended use, premium badge, favorite toggle,
 * select. Shared between the Resume and Cover Letter galleries — both
 * template types share the exact same `TemplateMetadata` shape.
 */
export function TemplateCard({
  template,
  selected,
  favorited,
  onSelect,
  onPreview,
  onToggleFavorite,
}: TemplateCardProps) {
  return (
    <Card
      data-testid={`template-card-${template.id}`}
      className={cn(
        'group flex flex-col overflow-hidden transition-shadow hover:shadow-md',
        selected && 'ring-2 ring-primary',
      )}
    >
      <div className="relative aspect-[3/4] w-full bg-muted/40 p-4">
        <button
          type="button"
          className="absolute inset-0 h-full w-full p-4"
          onClick={() => onPreview?.(template.id)}
          aria-label={`Pré-visualizar ${template.name}`}
        >
          <TemplateSwatch
            layout={template.layout}
            primaryColor={template.primaryColor}
            secondaryColor={template.secondaryColor}
          />
        </button>
        {selected && (
          <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
        <button
          type="button"
          onClick={() => onToggleFavorite(template.id, favorited)}
          className="absolute left-2 top-2 rounded-full bg-background/80 p-1.5 text-muted-foreground hover:text-warning"
          aria-label={favorited ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
          aria-pressed={favorited}
        >
          <Star className={cn('h-4 w-4', favorited && 'fill-warning text-warning')} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold leading-tight">{template.name}</p>
            <p className="text-xs text-muted-foreground">{humanizeEnum(template.category)}</p>
          </div>
          {template.premium && (
            <Badge variant="warning" className="shrink-0 gap-1">
              <Crown className="h-3 w-3" />
              Premium
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {template.isATSFriendly ? (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Compatível com ATS
            </Badge>
          ) : (
            <Badge variant="outline">Foco visual</Badge>
          )}
        </div>

        <Button
          type="button"
          size="sm"
          variant={selected ? 'default' : 'outline'}
          className="mt-auto"
          onClick={() => onSelect(template.id)}
        >
          {selected ? 'Selecionado' : 'Usar este modelo'}
        </Button>
      </div>
    </Card>
  );
}
