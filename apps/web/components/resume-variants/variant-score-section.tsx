'use client';

import { useMemo } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, ScanSearch, XCircle } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { ScoreBadge } from '@/components/score-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAtsReports, useRunAtsAnalysis, type AtsReport } from '@/lib/api/ats';
import { ApiError } from '@/lib/api-client';

const SCORE_ROWS: {
  key: keyof Pick<
    AtsReport,
    | 'keywordScore'
    | 'skillsScore'
    | 'experienceScore'
    | 'educationScore'
    | 'languageScore'
    | 'formattingScore'
    | 'completionScore'
  >;
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

export interface VariantScoreSectionProps {
  variantId: string;
  jobTargetId?: string | null;
}

/**
 * Inline ATS score panel for a Resume Variant — reuses the exact same hooks
 * and score breakdown as the standalone /dashboard/ats-reports/[id] page,
 * but scoped to one variant instead of requiring the user to navigate away
 * and find the right report in a generic list.
 */
export function VariantScoreSection({ variantId, jobTargetId }: VariantScoreSectionProps) {
  const { data: reports, isLoading } = useAtsReports();
  const runAnalysis = useRunAtsAnalysis();

  const latestReport = useMemo(() => {
    if (!reports) return undefined;
    return reports
      .filter((r) => r.resumeVariantId === variantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [reports, variantId]);

  async function handleRun() {
    try {
      await runAnalysis.mutateAsync(variantId);
      toast.success('Análise ATS concluída.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível executar a análise ATS.',
      );
    }
  }

  if (!jobTargetId) {
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            icon={ScanSearch}
            title="Associe esta versão a uma vaga"
            description="A pontuação ATS compara o seu currículo com os requisitos de uma vaga específica. Associe uma vaga-alvo para a ativar."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Pontuação ATS</CardTitle>
          <Button size="sm" onClick={handleRun} loading={runAnalysis.isPending}>
            <ScanSearch className="h-4 w-4" />
            {latestReport ? 'Executar novamente' : 'Executar análise ATS'}
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">A carregar…</p>
          ) : !latestReport ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Ainda não executou nenhuma análise ATS para esta versão.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-border p-4 text-center">
                <ScoreBadge score={latestReport.overallScore} size="lg" />
                <p className="text-sm text-muted-foreground">Pontuação Geral</p>
              </div>
              <div className="space-y-3 lg:col-span-2">
                {SCORE_ROWS.map((row) => (
                  <div key={row.key} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-sm text-muted-foreground">{row.label}</span>
                    <Progress value={latestReport[row.key]} className="flex-1" />
                    <span className="w-10 shrink-0 text-right text-sm font-medium">
                      {latestReport[row.key]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {latestReport && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Palavras-chave correspondidas
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {latestReport.matchedKeywords.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma</p>
                )}
                {latestReport.matchedKeywords.map((keyword) => (
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
                {latestReport.missingKeywords.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhuma</p>
                )}
                {latestReport.missingKeywords.map((keyword) => (
                  <Badge key={keyword} variant="destructive">
                    {keyword}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>

          {latestReport.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recomendações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {latestReport.recommendations.map((recommendation, index) => (
                  <Alert key={index}>
                    <AlertDescription>{recommendation}</AlertDescription>
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
