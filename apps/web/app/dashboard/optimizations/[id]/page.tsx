'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCheck, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { PriorityBadge } from '@/components/priority-badge';
import { ScoreBadge } from '@/components/score-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles } from 'lucide-react';
import {
  useOptimization,
  useApplySuggestions,
  useDeleteOptimization,
} from '@/lib/api/resume-optimization';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';

export default function OptimizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: optimization, isLoading, isError, refetch } = useOptimization(id);
  const applySuggestions = useApplySuggestions(id);
  const deleteOptimization = useDeleteOptimization();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  function toggle(suggestionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(suggestionId)) next.delete(suggestionId);
      else next.add(suggestionId);
      return next;
    });
  }

  async function handleApply() {
    if (selectedIds.size === 0) return;
    try {
      const result = await applySuggestions.mutateAsync(Array.from(selectedIds));
      toast.success(
        `${result.appliedSuggestionIds.length} sugestões aplicadas. Nova pontuação ATS: ${result.newAtsReport.overallScore}.`,
      );
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível aplicar as sugestões.');
    }
  }

  async function handleDelete() {
    try {
      await deleteOptimization.mutateAsync(id);
      toast.success('Otimização removida.');
      router.push('/dashboard/optimizations');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.');
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

  if (isError || !optimization) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  const applicableCount = optimization.suggestions.filter((s) => !s.applied).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Otimização com IA"
        description={formatDateTime(optimization.createdAt)}
        breadcrumbs={[
          { label: 'Otimizações', href: '/dashboard/optimizations' },
          { label: 'Detalhe' },
        ]}
        actions={
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-center gap-4 p-6">
            <div className="text-center">
              <ScoreBadge score={optimization.beforeScore} />
              <p className="mt-1 text-xs text-muted-foreground">Antes</p>
            </div>
            <span className="text-muted-foreground">→</span>
            <div className="text-center">
              <ScoreBadge score={optimization.predictedScore} />
              <p className="mt-1 text-xs text-muted-foreground">Previsto</p>
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Resumo</CardTitle>
            <StatusBadge status={optimization.status} />
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {optimization.summary ?? 'Sem resumo disponível.'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Sugestões</CardTitle>
          <Button
            size="sm"
            onClick={handleApply}
            loading={applySuggestions.isPending}
            disabled={selectedIds.size === 0}
          >
            <CheckCheck className="h-4 w-4" />
            Aplicar selecionadas ({selectedIds.size})
          </Button>
        </CardHeader>
        <CardContent>
          {optimization.suggestions.length === 0 ? (
            <EmptyState icon={Sparkles} title="Sem sugestões" />
          ) : applicableCount === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Todas as sugestões já foram aplicadas.
            </p>
          ) : (
            <ul className="space-y-3">
              {optimization.suggestions.map((suggestion) => (
                <li
                  key={suggestion.id}
                  className="flex items-start gap-3 rounded-md border border-border p-3"
                >
                  <Checkbox
                    className="mt-1"
                    checked={selectedIds.has(suggestion.id)}
                    disabled={suggestion.applied}
                    onCheckedChange={() => toggle(suggestion.id)}
                    aria-label={`Selecionar sugestão: ${suggestion.title}`}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{suggestion.title}</p>
                      <PriorityBadge priority={suggestion.priority} />
                      {suggestion.applied && (
                        <StatusBadge status="COMPLETED" className="text-[10px]" />
                      )}
                    </div>
                    {suggestion.reason && (
                      <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
                    )}
                    {suggestion.originalText && (
                      <p className="text-sm text-destructive line-through">
                        {suggestion.originalText}
                      </p>
                    )}
                    <p className="text-sm text-success">{suggestion.suggestedText}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar esta otimização?"
        description="As sugestões já aplicadas ao currículo não serão revertidas."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
