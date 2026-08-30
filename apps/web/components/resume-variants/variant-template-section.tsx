'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Save } from 'lucide-react';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ResumeTemplateGallery } from '@/components/template-engine/ResumeTemplateGallery';
import { ResumePreview } from '@/components/template-engine/ResumePreview';
import { ResponsivePreviewFrame } from '@/components/template-engine/ResponsivePreviewFrame';
import { ThemeEditor } from '@/components/template-engine/ThemeEditor';
import { ExportResumeButton } from '@/components/resume-variants/export-resume-button';
import {
  useResumeVariant,
  useSetResumeVariantTemplate,
  useUpdateResumeVariantTheme,
  useResetResumeVariantTheme,
} from '@/lib/api/resume-variants';
import { useProfile } from '@/lib/api/profile';
import { ApiError } from '@/lib/api-client';
import type { ThemeOverrides } from '@/lib/template-engine/theme';

export interface VariantTemplateSectionProps {
  variantId: string;
}

/**
 * Template + theme workspace for a Resume Variant — the same gallery, live
 * preview and theme editor previously only reachable at
 * /dashboard/resume-variants/[id]/template, extracted so it can also be
 * embedded as a tab on the variant's main page. Self-fetches the variant via
 * `useResumeVariant`, so react-query dedupes against whatever the parent
 * page already fetched under the same ['resume-variants', id] key — no extra
 * network request when used inside the unified workspace.
 */
export function VariantTemplateSection({ variantId }: VariantTemplateSectionProps) {
  const { data: variant, isLoading, isError, refetch } = useResumeVariant(variantId);
  const { data: profile } = useProfile();
  const setTemplate = useSetResumeVariantTemplate(variantId);
  const updateTheme = useUpdateResumeVariantTheme(variantId);
  const resetTheme = useResetResumeVariantTheme(variantId);

  const [pendingTemplateId, setPendingTemplateId] = useState<string | undefined>(undefined);
  const [pendingTheme, setPendingTheme] = useState<ThemeOverrides | undefined>(undefined);

  async function handleSelectTemplate(templateId: string) {
    setPendingTemplateId(templateId);
    try {
      await setTemplate.mutateAsync(templateId);
      toast.success('Modelo aplicado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível aplicar o modelo.');
    }
  }

  async function handleSaveTheme() {
    if (!pendingTheme) return;
    try {
      await updateTheme.mutateAsync(pendingTheme as Record<string, unknown>);
      toast.success('Personalização guardada.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível guardar a personalização.',
      );
    }
  }

  async function handleResetTheme() {
    try {
      await resetTheme.mutateAsync();
      setPendingTheme(undefined);
      toast.success('Personalização reposta.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível repor a personalização.',
      );
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !variant) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  const effectiveTemplateId = pendingTemplateId ?? variant.templateId ?? undefined;
  const currentOverrides = (variant.themeOverrides ?? undefined) as ThemeOverrides | undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Escolher modelo</CardTitle>
          </CardHeader>
          <CardContent>
            <ResumeTemplateGallery
              selectedTemplateId={effectiveTemplateId}
              onSelect={handleSelectTemplate}
            />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Pré-visualização</CardTitle>
            <ExportResumeButton resumeVariantId={variantId} />
          </CardHeader>
          <CardContent>
            <ResponsivePreviewFrame>
              <ResumePreview
                content={variant.content}
                profile={profile}
                templateId={variant.templateId}
                templateIdOverride={pendingTemplateId}
                themeOverrides={currentOverrides}
                themeOverridesOverride={pendingTheme}
              />
            </ResponsivePreviewFrame>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personalizar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ThemeEditor
              value={pendingTheme ?? currentOverrides ?? {}}
              onChange={setPendingTheme}
              onReset={handleResetTheme}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleResetTheme}
                disabled={resetTheme.isPending}
              >
                <RotateCcw className="h-4 w-4" />
                Repor
              </Button>
              <Button
                type="button"
                onClick={handleSaveTheme}
                disabled={!pendingTheme}
                loading={updateTheme.isPending}
              >
                <Save className="h-4 w-4" />
                Guardar personalização
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
