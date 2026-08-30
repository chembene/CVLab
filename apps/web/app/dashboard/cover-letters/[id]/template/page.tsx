'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { RotateCcw, Save } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CoverLetterTemplateGallery } from '@/components/template-engine/CoverLetterTemplateGallery';
import { CoverLetterPreview } from '@/components/template-engine/CoverLetterPreview';
import { ResponsivePreviewFrame } from '@/components/template-engine/ResponsivePreviewFrame';
import { ThemeEditor } from '@/components/template-engine/ThemeEditor';
import {
  useCoverLetter,
  useSetCoverLetterTemplate,
  useUpdateCoverLetterTheme,
  useResetCoverLetterTheme,
} from '@/lib/api/cover-letters';
import { useProfile } from '@/lib/api/profile';
import { ApiError } from '@/lib/api-client';
import type { ThemeOverrides } from '@/lib/template-engine/theme';

/** Part 8 + Part 5/6 — Cover Letter Template Selector, mirroring the Resume Variant template page. */
export default function CoverLetterTemplatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: letter, isLoading, isError, refetch } = useCoverLetter(id);
  const { data: profile } = useProfile();
  const setTemplate = useSetCoverLetterTemplate(id);
  const updateTheme = useUpdateCoverLetterTheme(id);
  const resetTheme = useResetCoverLetterTheme(id);

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

  if (isError || !letter) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  const effectiveTemplateId = pendingTemplateId ?? letter.templateId ?? undefined;
  const currentOverrides = (letter.themeOverrides ?? undefined) as ThemeOverrides | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modelo e Aparência"
        description={letter.title}
        breadcrumbs={[
          { label: 'Cartas de Apresentação', href: '/dashboard/cover-letters' },
          { label: letter.title, href: `/dashboard/cover-letters/${letter.id}` },
          { label: 'Modelo' },
        ]}
        actions={
          <Button
            variant="outline"
            onClick={() => router.push(`/dashboard/cover-letters/${letter.id}`)}
          >
            Voltar
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Escolher modelo</CardTitle>
            </CardHeader>
            <CardContent>
              <CoverLetterTemplateGallery
                selectedTemplateId={effectiveTemplateId}
                onSelect={handleSelectTemplate}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pré-visualização</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsivePreviewFrame>
                <CoverLetterPreview
                  title={letter.title}
                  body={letter.content}
                  profile={profile}
                  templateId={letter.templateId}
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
    </div>
  );
}
