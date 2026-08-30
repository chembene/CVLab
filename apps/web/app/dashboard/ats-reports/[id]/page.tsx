'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Bot, CheckCircle2, ListChecks, Sparkles, Trash2, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ScoreBadge } from '@/components/score-badge';
import { PriorityBadge } from '@/components/priority-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAtsReport, useDeleteAtsReport } from '@/lib/api/ats';
import {
  useAtsAiAnalyses,
  useAnalyzeWithAi,
  ATS_AI_FEATURE_KEY,
  type AtsAiRecommendation,
  type AtsAiAnalysis,
} from '@/lib/api/ats-ai';
import { useCreditEstimate } from '@/lib/api/career-advisor';
import { formatDateTime } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

function RecommendationList({ items }: { items: AtsAiRecommendation[] }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <Alert key={index}>
          <AlertTitle className="flex items-center gap-2">
            <PriorityBadge priority={item.priority} />
            {item.category}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            <p>{item.explanation}</p>
            <p className="font-medium text-foreground">{item.recommendation}</p>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}

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

  const { data: estimate } = useCreditEstimate(ATS_AI_FEATURE_KEY);
  const {
    data: aiAnalyses,
    isLoading: aiLoading,
    isError: aiError,
    refetch: refetchAi,
  } = useAtsAiAnalyses();
  const analyzeWithAi = useAnalyzeWithAi();
  const [justGeneratedAnalysis, setJustGeneratedAnalysis] = useState<AtsAiAnalysis | null>(null);
  const insufficientBalance = estimate ? !estimate.sufficientBalance : false;
  // Most recent AI interpretation for THIS report — cross-referenced
  // client-side from the user's full analysis history (no atsReportId query
  // param was added backend-side), same pattern already established for
  // Application Tracker/Career Advisor. Prefers the just-generated result
  // (set directly from the mutation's own response) over the history
  // query's own data, so the new analysis renders immediately without
  // waiting on/depending on its invalidation-triggered refetch to land.
  const latestAiAnalysis =
    justGeneratedAnalysis ?? aiAnalyses?.filter((a) => a.atsReportId === id)[0] ?? null;

  async function handleDelete() {
    try {
      await deleteReport.mutateAsync(id);
      toast.success('Relatório removido.');
      router.push('/dashboard/ats-reports');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  async function handleAnalyzeWithAi() {
    try {
      const analysis = await analyzeWithAi.mutateAsync(id);
      setJustGeneratedAnalysis(analysis);
      toast.success('Interpretação de IA gerada.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível gerar a interpretação.',
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            Interpretação com IA
          </CardTitle>
          {!latestAiAnalysis && (
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="gap-1">
                {estimate ? `Custo: ${estimate.cost} créditos` : 'A calcular custo…'}
              </Badge>
              <Button
                size="sm"
                onClick={handleAnalyzeWithAi}
                loading={analyzeWithAi.isPending}
                disabled={insufficientBalance}
              >
                <Sparkles className="h-4 w-4" />
                Analisar com IA
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {insufficientBalance && estimate && !latestAiAnalysis && (
            <p role="alert" className="text-sm text-destructive">
              Saldo insuficiente: precisa de {estimate.cost} créditos, tem {estimate.currentBalance}
              .
            </p>
          )}

          {aiLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : aiError ? (
            <ErrorState onRetry={() => refetchAi()} />
          ) : !latestAiAnalysis ? (
            <EmptyState
              icon={Bot}
              title="Ainda sem interpretação de IA"
              description="Peça uma leitura mais profunda deste relatório — pontos fortes, problemas prioritários e um plano de ação."
            />
          ) : (
            <>
              <p className="text-sm text-foreground">{latestAiAnalysis.overallAssessment}</p>

              {latestAiAnalysis.strengths.length > 0 && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Pontos fortes
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {latestAiAnalysis.strengths.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {latestAiAnalysis.priorityIssues.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">Problemas prioritários</p>
                  <RecommendationList items={latestAiAnalysis.priorityIssues} />
                </div>
              )}

              {latestAiAnalysis.contentRecommendations.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">Recomendações de conteúdo</p>
                  <RecommendationList items={latestAiAnalysis.contentRecommendations} />
                </div>
              )}

              {latestAiAnalysis.sectionRecommendations.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">Recomendações de secções</p>
                  <RecommendationList items={latestAiAnalysis.sectionRecommendations} />
                </div>
              )}

              {latestAiAnalysis.actionPlan.length > 0 && (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    <ListChecks className="h-4 w-4 text-primary" />
                    Plano de ação
                  </p>
                  <ol className="space-y-1 text-sm text-muted-foreground">
                    {latestAiAnalysis.actionPlan.map((item, i) => (
                      <li key={i}>
                        {i + 1}. {item}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

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
