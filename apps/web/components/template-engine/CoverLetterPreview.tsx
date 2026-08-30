'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useCoverLetterTemplate } from '@/lib/api/templates';
import { resolveTheme, type ThemeOverrides } from '@/lib/template-engine/theme';
import { CoverLetterLayout } from './layouts/CoverLetterLayout';
import type { Profile } from '@/lib/api/profile';

export interface CoverLetterPreviewProps {
  title: string;
  body: string;
  profile?: Profile | null;
  templateId?: string | null;
  templateIdOverride?: string;
  themeOverrides?: ThemeOverrides | null;
  themeOverridesOverride?: ThemeOverrides;
}

export const DEFAULT_COVER_LETTER_TEMPLATE_ID = 'cl-professional';

export function CoverLetterPreview({
  title,
  body,
  profile,
  templateId,
  templateIdOverride,
  themeOverrides,
  themeOverridesOverride,
}: CoverLetterPreviewProps) {
  const effectiveTemplateId = templateIdOverride ?? templateId ?? DEFAULT_COVER_LETTER_TEMPLATE_ID;
  const { data: template, isLoading, isError } = useCoverLetterTemplate(effectiveTemplateId);
  const effectiveOverrides = themeOverridesOverride ?? themeOverrides ?? undefined;

  if (isError) {
    return (
      <p className="p-6 text-sm text-destructive">
        Não foi possível carregar o modelo selecionado.
      </p>
    );
  }
  if (isLoading || !template) {
    return <Skeleton className="h-[500px] w-full" />;
  }

  const theme = resolveTheme(template, effectiveOverrides);

  return <CoverLetterLayout title={title} body={body} profile={profile} theme={theme} />;
}
