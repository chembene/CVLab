'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { useResumeTemplate } from '@/lib/api/templates';
import { resolveTheme, type ThemeOverrides } from '@/lib/template-engine/theme';
import { ResumeLayout } from './layouts/ResumeLayout';
import type { Profile } from '@/lib/api/profile';

export interface ResumePreviewProps {
  content: Record<string, unknown>;
  profile?: Profile | null;
  /** Persisted template id (`ResumeVariant.templateId`) — the fallback when no live override is being previewed. */
  templateId?: string | null;
  /** Live, unsaved template selection (Part 5 "Live Preview" — updates instantly, no save/reload needed). */
  templateIdOverride?: string;
  /** Persisted theme overrides. */
  themeOverrides?: ThemeOverrides | null;
  /** Live, unsaved theme edits (Part 5/6) — takes precedence over the persisted value. */
  themeOverridesOverride?: ThemeOverrides;
}

/** The safe, always-ATS-friendly default every Resume Variant renders with until the user explicitly picks one. */
export const DEFAULT_RESUME_TEMPLATE_ID = 'ats-classic';

export function ResumePreview({
  content,
  profile,
  templateId,
  templateIdOverride,
  themeOverrides,
  themeOverridesOverride,
}: ResumePreviewProps) {
  const effectiveTemplateId = templateIdOverride ?? templateId ?? DEFAULT_RESUME_TEMPLATE_ID;
  const { data: template, isLoading, isError } = useResumeTemplate(effectiveTemplateId);
  const effectiveOverrides = themeOverridesOverride ?? themeOverrides ?? undefined;

  if (isError) {
    return (
      <p className="p-6 text-sm text-destructive">
        Não foi possível carregar o modelo selecionado.
      </p>
    );
  }
  if (isLoading || !template) {
    return <Skeleton className="h-[600px] w-full" />;
  }

  const theme = resolveTheme(template, effectiveOverrides);

  return (
    <ResumeLayout
      content={content}
      profile={profile}
      theme={theme}
      supportedSections={template.supportedSections}
    />
  );
}
