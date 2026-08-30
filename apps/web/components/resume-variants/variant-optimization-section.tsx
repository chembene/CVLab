'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCheck, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ScoreBadge } from '@/components/score-badge';
import { StatusBadge } from '@/components/status-badge';
import { PriorityBadge } from '@/components/priority-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  useOptimizations,
  useRunOptimization,
  useApplySuggestions,
} from '@/lib/api/resume-optimization';
import { ApiError } from '@/lib/api-client';

export interface VariantOptimizationSectionProps {
  variantId: string;
  jobTargetId?: string | null;
}

/**
 * Inline AI optimization panel for a Resume Variant — reuses the exact same
 * hooks and suggestion-apply flow as the standalone
 * /dashboard/optimizations/[id] page, scoped to one variant so "Otimizar com
 * IA" actually runs against the variant being viewed instead of dropping the
 * user into a generic, unscoped list.
 */
export function VariantOptimizationSection({
  variantId,
  jobTargetId,
}: VariantOptimizationSectionProps) {
  const { data: optimizations, isLoading } = useOptimizations();
  const runOptimization = useRunOptimization();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const latest = useMemo(() => {
    if (!optimizations) return undefined;
    return optimizations
      .filter((o) => o.resumeVariantId === variantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [optimizations, variantId]);

  const applySuggestions = useApplySuggestions(latest?.id ?? '');

  function toggle(suggestionId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(suggestionId)) next.delete(suggestionId);
      else next.add(suggestionId);
      return next;
    });
  }

  async function handleRun() {
    try {
      await runOptimization.mutateAsync({ resumeVariantId: variantId });
      toast.success('Sugestões de otimização geradas.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível gerar sugestões de otimização.',
      );
    }
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

  if (!jobTargetId) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={Sparkles}
            title="Associe esta versão a uma vaga"
            description="A otimização por IA usa a vaga-alvo para sugerir melhorias no conteúdo. Associe uma vaga-alvo para a ativar."
          />
        </CardContent>
      </Card>
    );
  }

  const applicableCount = latest?.suggestions.filter((s) => !s.applied).length ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Otimização com IA</CardTitle>
        <div className="flex items-center gap-2">
          {latest && applicableCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleApply}
              loading={applySuggestions.isPending}
              disabled={selectedIds.size === 0}
            >
              <CheckCheck className="h-4 w-4" />
              Aplicar selecionadas ({selectedIds.size})
            </Button>
          )}
          <Button size="sm" onClick={handleRun} loading={runOptimization.isPending}>
            <Sparkles className="h-4 w-4" />
            {latest ? 'Gerar novas sugestões' : 'Otimizar com IA'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">A carregar…</p>
        ) : !latest ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ainda não gerou sugestões de otimização para esta versão.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <ScoreBadge score={latest.beforeScore} />
                  <p className="mt-1 text-xs text-muted-foreground">Antes</p>
                </div>
                <span className="text-muted-foreground">→</span>
                <div className="text-center">
                  <ScoreBadge score={latest.predictedScore} />
                  <p className="mt-1 text-xs text-muted-foreground">Previsto</p>
                </div>
              </div>
              <StatusBadge status={latest.status} />
              {latest.summary && (
                <p className="max-w-md text-sm text-muted-foreground">{latest.summary}</p>
              )}
            </div>

            {latest.suggestions.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sem sugestões.</p>
            ) : (
              <ul className="space-y-3">
                {latest.suggestions.map((suggestion) => (
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
