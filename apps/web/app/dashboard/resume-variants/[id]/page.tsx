'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Archive, Copy, RotateCcw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VariantScoreSection } from '@/components/resume-variants/variant-score-section';
import { VariantOptimizationSection } from '@/components/resume-variants/variant-optimization-section';
import { VariantTemplateSection } from '@/components/resume-variants/variant-template-section';
import {
  useResumeVariant,
  useArchiveResumeVariant,
  useRestoreResumeVariant,
  useDeleteResumeVariant,
  useDuplicateResumeVariant,
} from '@/lib/api/resume-variants';
import { useJobTarget } from '@/lib/api/job-targets';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';

function contentArrayLength(content: Record<string, unknown>, key: string): number {
  const value = content[key];
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Unified Resume Variant workspace — one page, three tabs (Overview / Score
 * & Optimization / Template & Appearance) instead of three separate routes
 * with dead-end "go find the right item in this generic list" links. See
 * docs/architecture/resume-variant-workspace.md for the rationale.
 */
export default function ResumeVariantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: variant, isLoading, isError, refetch } = useResumeVariant(id);
  const { data: jobTarget } = useJobTarget(variant?.jobTargetId ?? '');
  const archiveVariant = useArchiveResumeVariant();
  const restoreVariant = useRestoreResumeVariant();
  const deleteVariant = useDeleteResumeVariant();
  const duplicateVariant = useDuplicateResumeVariant();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleArchiveToggle() {
    if (!variant) return;
    try {
      if (variant.archived) {
        await restoreVariant.mutateAsync(variant.id);
        toast.success('Versão restaurada.');
      } else {
        await archiveVariant.mutateAsync(variant.id);
        toast.success('Versão arquivada.');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar.');
    }
  }

  async function handleDuplicate() {
    if (!variant) return;
    try {
      const copy = await duplicateVariant.mutateAsync({ id: variant.id });
      toast.success('Versão duplicada.');
      router.push(`/dashboard/resume-variants/${copy.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível duplicar.');
    }
  }

  async function handleDelete() {
    if (!variant) return;
    try {
      await deleteVariant.mutateAsync(variant.id);
      toast.success('Versão removida.');
      router.push('/dashboard/resume-variants');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !variant) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  const content = variant.content ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title={variant.title}
        breadcrumbs={[
          { label: 'Versões do Currículo', href: '/dashboard/resume-variants' },
          { label: variant.title },
        ]}
        actions={
          <>
            <Button variant="outline" onClick={handleDuplicate}>
              <Copy className="h-4 w-4" />
              Duplicar
            </Button>
            <Button variant="outline" onClick={handleArchiveToggle}>
              {variant.archived ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {variant.archived ? 'Restaurar' : 'Arquivar'}
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          </>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="score">Pontuação &amp; Otimização</TabsTrigger>
          <TabsTrigger value="template">Modelo &amp; Aparência</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Resumo do Conteúdo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {typeof content.summary === 'string' && content.summary && (
                  <p className="text-muted-foreground">{content.summary}</p>
                )}
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['Experiência', 'workExperiences'],
                      ['Formação', 'educations'],
                      ['Competências', 'skills'],
                      ['Idiomas', 'languages'],
                      ['Certificados', 'certificates'],
                      ['Projetos', 'projects'],
                    ] satisfies [string, string][]
                  ).map(([label, key]) => (
                    <div key={key} className="rounded-md border border-border p-3">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="text-lg font-semibold">{contentArrayLength(content, key)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="text-xs text-muted-foreground">
                  Esta é uma cópia independente do seu currículo principal — editar o currículo
                  principal não altera esta versão.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado</span>
                  <StatusBadge status={variant.status} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Versão</span>
                  <span>v{variant.version}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Atualizado</span>
                  <span>{formatDateTime(variant.updatedAt)}</span>
                </div>
                {jobTarget && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Vaga alvo</span>
                    <Link
                      href={`/dashboard/job-targets/${jobTarget.id}`}
                      className="truncate text-primary hover:underline"
                    >
                      {jobTarget.title}
                    </Link>
                  </div>
                )}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Completo</span>
                    <span>{variant.completionPercentage}%</span>
                  </div>
                  <Progress value={variant.completionPercentage} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="score" className="space-y-4">
          <VariantScoreSection variantId={variant.id} jobTargetId={variant.jobTargetId} />
          <VariantOptimizationSection variantId={variant.id} jobTargetId={variant.jobTargetId} />
        </TabsContent>

        <TabsContent value="template">
          <VariantTemplateSection variantId={variant.id} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar esta versão de currículo?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
