'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Plus, ScanSearch, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ScoreBadge } from '@/components/score-badge';
import { ResumeVariantSelect } from '@/components/resume-variant-select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAtsReports, useRunAtsAnalysis, useDeleteAtsReport } from '@/lib/api/ats';
import { ApiError } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';

export default function AtsReportsPage() {
  const { data: reports, isLoading, isError, refetch } = useAtsReports();
  const runAnalysis = useRunAtsAnalysis();
  const deleteReport = useDeleteAtsReport();

  const [runOpen, setRunOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleRun() {
    if (!selectedVariantId) return;
    try {
      const report = await runAnalysis.mutateAsync(selectedVariantId);
      toast.success('Análise ATS concluída.');
      setRunOpen(false);
      setSelectedVariantId('');
      window.location.assign(`/dashboard/ats-reports/${report.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível executar a análise.');
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await deleteReport.mutateAsync(deletingId);
      toast.success('Relatório removido.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Relatórios ATS"
        description="Compare uma versão do seu currículo com a vaga alvo associada."
        actions={
          <Button onClick={() => setRunOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova análise
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
      ) : !reports || reports.length === 0 ? (
        <EmptyState
          icon={ScanSearch}
          title="Nenhum relatório ATS"
          description="Execute a sua primeira análise para ver como o seu currículo se compara com uma vaga."
          action={<Button onClick={() => setRunOpen(true)}>Nova análise</Button>}
        />
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <Card key={report.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <ScoreBadge score={report.overallScore} />
                <Link href={`/dashboard/ats-reports/${report.id}`} className="min-w-0 flex-1">
                  <p className="font-medium hover:underline">Relatório ATS</p>
                  <p className="text-sm text-muted-foreground">
                    {report.matchedKeywords.length} palavras-chave correspondidas ·{' '}
                    {report.missingKeywords.length} em falta ·{' '}
                    {formatRelativeTime(report.createdAt)}
                  </p>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar"
                  onClick={() => setDeletingId(report.id)}
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
            <DialogTitle>Executar análise ATS</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ResumeVariantSelect value={selectedVariantId} onChange={setSelectedVariantId} />
            <p className="text-xs text-muted-foreground">
              Apenas versões de currículo associadas a uma vaga alvo podem ser analisadas.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRunOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRun}
              loading={runAnalysis.isPending}
              disabled={!selectedVariantId}
            >
              Executar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Eliminar este relatório?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
