'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { ResumeVariantSelect } from '@/components/resume-variant-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useOptimizations,
  useRunOptimization,
  useDeleteOptimization,
} from '@/lib/api/resume-optimization';
import { ApiError } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';

export default function OptimizationsPage() {
  const { data: optimizations, isLoading, isError, refetch } = useOptimizations();
  const runOptimization = useRunOptimization();
  const deleteOptimization = useDeleteOptimization();

  const [runOpen, setRunOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [force, setForce] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleRun() {
    if (!selectedVariantId) return;
    try {
      const optimization = await runOptimization.mutateAsync({
        resumeVariantId: selectedVariantId,
        force,
      });
      toast.success('Otimização concluída.');
      setRunOpen(false);
      window.location.assign(`/dashboard/optimizations/${optimization.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível executar a otimização.',
      );
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await deleteOptimization.mutateAsync(deletingId);
      toast.success('Otimização removida.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Otimização com IA"
        description="Receba sugestões de melhoria geradas por IA para uma versão do seu currículo."
        actions={
          <Button onClick={() => setRunOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova otimização
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !optimizations || optimizations.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhuma otimização"
          description="Execute a sua primeira otimização com IA para melhorar o seu currículo."
          action={<Button onClick={() => setRunOpen(true)}>Nova otimização</Button>}
        />
      ) : (
        <div className="space-y-3">
          {optimizations.map((optimization) => (
            <Card key={optimization.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex shrink-0 flex-col items-center text-xs text-muted-foreground">
                  <span className="text-lg font-semibold text-foreground">
                    {optimization.beforeScore}
                  </span>
                  <span>→</span>
                  <span className="text-lg font-semibold text-primary">
                    {optimization.predictedScore ?? '—'}
                  </span>
                </div>
                <Link
                  href={`/dashboard/optimizations/${optimization.id}`}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate font-medium hover:underline">
                    {optimization.summary ?? 'Otimização de currículo'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {optimization.suggestions.length} sugestões ·{' '}
                    {formatRelativeTime(optimization.createdAt)}
                  </p>
                </Link>
                <StatusBadge status={optimization.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar"
                  onClick={() => setDeletingId(optimization.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={runOpen} onOpenChange={setRunOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova otimização com IA</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ResumeVariantSelect value={selectedVariantId} onChange={setSelectedVariantId} />
            <div className="flex items-center gap-2">
              <Checkbox
                id="force"
                checked={force}
                onCheckedChange={(checked) => setForce(checked === true)}
              />
              <Label htmlFor="force" className="font-normal">
                Executar uma nova análise ATS antes de otimizar
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRun}
              loading={runOptimization.isPending}
              disabled={!selectedVariantId}
            >
              Otimizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Eliminar esta otimização?"
        description="As sugestões já aplicadas ao currículo não serão revertidas."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
