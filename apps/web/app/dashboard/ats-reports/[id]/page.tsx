'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Sparkles, Trash2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ScoreBadge } from '@/components/score-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAtsReport, useDeleteAtsReport } from '@/lib/api/ats';
import { formatDateTime } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

const SCORE_ROWS: {
  key:
    | 'keywordScore'
    | 'skillsScore'
    | 'experienceScore'
    | 'educationScore'
    | 'languageScore'
    | 'formattingScore'
    | 'completionScore';
  label: string;
}[] = [
  { key: 'keywordScore', label: 'Palavras-chave' },
  { key: 'skillsScore', label: 'Competências' },
  { key: 'experienceScore', label: 'Experiência' },
  { key: 'educationScore', label: 'Formação' },
  { key: 'languageScore', label: 'Idiomas' },
  { key: 'formattingScore', label: 'Formatação' },
  { key: 'completionScore', label: 'Completude' },
];

export default function AtsReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: report, isLoading, isError, refetch } = useAtsReport(id);
  const deleteReport = useDeleteAtsReport();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleDelete() {
    try {
      await deleteReport.mutateAsync(id);
      toast.success('Relatório removido.');
      router.push('/dashboard/ats-reports');
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

  if (isError || !report) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatório ATS"
        description={formatDateTime(report.createdAt)}
        breadcrumbs={[
          { label: 'Relatórios ATS', href: '/dashboard/ats-reports' },
          { label: 'Detalhe' },
        ]}
        actions={
          <>
            <Button asChild>
              <a href="/dashboard/optimizations">
                <Sparkles className="h-4 w-4" />
                Otimizar com IA
              </a>
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center gap-2 p-6 text-center">
          <ScoreBadge score={report.overallScore} size="lg" />
          <p className="text-sm text-muted-foreground">Pontuação Geral</p>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Detalhe da pontuação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SCORE_ROWS.map((row) => (
              <div key={row.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-sm text-muted-foreground">{row.label}</span>
                <Progress value={report[row.key]} className="flex-1" />
                <span className="w-10 shrink-0 text-right text-sm font-medium">
                  {report[row.key]}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Palavras-chave correspondidas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {report.matchedKeywords.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma</p>
            )}
            {report.matchedKeywords.map((keyword) => (
              <Badge key={keyword} variant="success">
                {keyword}
              </Badge>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <XCircle className="h-4 w-4 text-destructive" />
              Palavras-chave em falta
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {report.missingKeywords.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma</p>
            )}
            {report.missingKeywords.map((keyword) => (
              <Badge key={keyword} variant="destructive">
                {keyword}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      {report.recommendedSkills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competências recomendadas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {report.recommendedSkills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {report.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recomendações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.recommendations.map((recommendation, index) => (
              <Alert key={index}>
                <AlertDescription>{recommendation}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar este relatório?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
