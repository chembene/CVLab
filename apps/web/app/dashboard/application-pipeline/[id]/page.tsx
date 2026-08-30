'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  CoverLetterTone,
  InterviewDifficulty,
  InterviewType,
  ApplicationStatus,
} from '@cvlab/types';
import { Check, CircleDashed, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { ScoreBadge } from '@/components/score-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  usePipelineSession,
  useRunAtsStep,
  useRunOptimizationStep,
  useApplySuggestionsStep,
  useGenerateCoverLetterStep,
  useStartInterviewStep,
  useExportPipelineStep,
  useFinalizeStep,
  useAbandonPipeline,
} from '@/lib/api/application-pipeline';
import { useAtsReport } from '@/lib/api/ats';
import { useOptimization } from '@/lib/api/resume-optimization';
import { ApiError } from '@/lib/api-client';

interface StepCardProps {
  index: number;
  title: string;
  done: boolean;
  active: boolean;
  children: React.ReactNode;
}

function StepCard({ index, title, done, active, children }: StepCardProps) {
  return (
    <Card className={active ? 'border-primary' : undefined}>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            done
              ? 'bg-success/10 text-success'
              : active
                ? 'bg-primary/10 text-primary'
                : 'bg-muted text-muted-foreground'
          }`}
        >
          {done ? <Check className="h-4 w-4" /> : index}
        </div>
        <CardTitle className="text-base">{title}</CardTitle>
        {!done && !active && <CircleDashed className="ml-auto h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function ApplicationPipelinePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isLoading, isError, refetch } = usePipelineSession(id);

  const runAts = useRunAtsStep(id);
  const runOptimization = useRunOptimizationStep(id);
  const applySuggestions = useApplySuggestionsStep(id);
  const generateCoverLetter = useGenerateCoverLetterStep(id);
  const startInterview = useStartInterviewStep(id);
  const exportStep = useExportPipelineStep(id);
  const finalize = useFinalizeStep(id);
  const abandon = useAbandonPipeline(id);

  const { data: atsReport } = useAtsReport(session?.atsReportId ?? '');
  const { data: optimization } = useOptimization(session?.optimizationId ?? '');

  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<string[]>([]);
  const [tone, setTone] = useState<CoverLetterTone>(CoverLetterTone.PROFESSIONAL);
  const [language, setLanguage] = useState('pt-MZ');
  const [interviewType, setInterviewType] = useState<InterviewType>(InterviewType.MIXED);
  const [interviewDifficulty, setInterviewDifficulty] = useState<InterviewDifficulty>(
    InterviewDifficulty.MID,
  );
  const [finalStatus, setFinalStatus] = useState<ApplicationStatus>(ApplicationStatus.APPLIED);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isError || !session) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  async function handleAts() {
    try {
      await runAts.mutateAsync();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível analisar a compatibilidade.',
      );
    }
  }

  async function handleOptimize() {
    try {
      await runOptimization.mutateAsync({});
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível gerar sugestões de melhoria.',
      );
    }
  }

  async function handleApplySuggestions() {
    if (selectedSuggestionIds.length === 0) return;
    try {
      await applySuggestions.mutateAsync({ suggestionIds: selectedSuggestionIds });
      toast.success('Sugestões aplicadas.');
      setSelectedSuggestionIds([]);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível aplicar as sugestões.');
    }
  }

  async function handleGenerateCoverLetter() {
    try {
      await generateCoverLetter.mutateAsync({ tone, language });
      toast.success('Carta de apresentação criada.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível criar a carta de apresentação.',
      );
    }
  }

  async function handleStartInterview() {
    try {
      await startInterview.mutateAsync({
        type: interviewType,
        difficulty: interviewDifficulty,
        language,
      });
      toast.success('Sessão de entrevista criada.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível iniciar a prática de entrevista.',
      );
    }
  }

  async function handleExport(format: 'PDF' | 'DOCX') {
    try {
      await exportStep.mutateAsync(format);
      toast.success('Exportação concluída.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível gerar o ficheiro.');
    }
  }

  async function handleFinalize() {
    try {
      await finalize.mutateAsync({ status: finalStatus });
      toast.success('Candidatura registada.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível registar a candidatura.',
      );
    }
  }

  async function handleAbandon() {
    try {
      await abandon.mutateAsync();
      toast.success('Preparação abandonada.');
      router.push('/dashboard/job-targets');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível abandonar a preparação.',
      );
    }
  }

  const isFinished = session.status !== 'IN_PROGRESS';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Preparar candidatura"
        breadcrumbs={[
          { label: 'Vagas Alvo', href: '/dashboard/job-targets' },
          { label: 'Preparar candidatura' },
        ]}
        actions={
          !isFinished ? (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={handleAbandon}
              loading={abandon.isPending}
            >
              Abandonar
            </Button>
          ) : undefined
        }
      />

      {session.status === 'ABANDONED' && (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Esta preparação foi abandonada.
        </p>
      )}
      {session.status === 'COMPLETED' && (
        <p className="rounded-md bg-success/10 p-3 text-sm text-success">
          Candidatura registada com sucesso.
        </p>
      )}

      <div className="space-y-4">
        <StepCard
          index={1}
          title="Análise de compatibilidade (ATS)"
          done={Boolean(session.atsReportId)}
          active={!session.atsReportId}
        >
          {session.atsReportId && atsReport ? (
            <div className="flex items-center gap-4">
              <ScoreBadge score={atsReport.overallScore} />
              <p className="text-sm text-muted-foreground">
                {atsReport.matchedKeywords.length} palavras-chave correspondidas ·{' '}
                {atsReport.missingKeywords.length} em falta
              </p>
            </div>
          ) : (
            <Button onClick={handleAts} loading={runAts.isPending}>
              Analisar compatibilidade
            </Button>
          )}
        </StepCard>

        <StepCard
          index={2}
          title="Melhorar currículo com IA"
          done={Boolean(session.newAtsReportId)}
          active={Boolean(session.atsReportId) && !session.newAtsReportId}
        >
          {!session.optimizationId ? (
            <Button
              onClick={handleOptimize}
              loading={runOptimization.isPending}
              disabled={!session.atsReportId}
            >
              Gerar sugestões de melhoria
            </Button>
          ) : optimization ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{optimization.summary}</p>
              {optimization.suggestions.map((s) => (
                <label key={s.id} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={s.applied || selectedSuggestionIds.includes(s.id)}
                    disabled={s.applied}
                    onCheckedChange={(checked) =>
                      setSelectedSuggestionIds((prev) =>
                        checked ? [...prev, s.id] : prev.filter((sid) => sid !== s.id),
                      )
                    }
                  />
                  <span>
                    <span className="font-medium">{s.title}</span>
                    {s.applied && <span className="ml-2 text-xs text-success">Aplicada</span>}
                    <br />
                    <span className="text-muted-foreground">{s.suggestedText}</span>
                  </span>
                </label>
              ))}
              <Button
                onClick={handleApplySuggestions}
                loading={applySuggestions.isPending}
                disabled={selectedSuggestionIds.length === 0}
              >
                Aplicar selecionadas
              </Button>
            </div>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" />
          )}
        </StepCard>

        <StepCard
          index={3}
          title="Carta de apresentação"
          done={Boolean(session.coverLetterId)}
          active={!session.coverLetterId}
        >
          {session.coverLetterId ? (
            <p className="text-sm text-success">Carta de apresentação criada.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Select value={tone} onValueChange={(v) => setTone(v as CoverLetterTone)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(CoverLetterTone).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="w-28"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="Idioma"
                placeholder="pt-MZ"
              />
              <Button onClick={handleGenerateCoverLetter} loading={generateCoverLetter.isPending}>
                Criar carta de apresentação
              </Button>
            </div>
          )}
        </StepCard>

        <StepCard
          index={4}
          title="Preparar entrevista"
          done={Boolean(session.interviewSessionId)}
          active={!session.interviewSessionId}
        >
          {session.interviewSessionId ? (
            <p className="text-sm text-success">
              Sessão de entrevista criada — continue em Prática de Entrevista.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Select
                value={interviewType}
                onValueChange={(v) => setInterviewType(v as InterviewType)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(InterviewType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={interviewDifficulty}
                onValueChange={(v) => setInterviewDifficulty(v as InterviewDifficulty)}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(InterviewDifficulty).map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleStartInterview} loading={startInterview.isPending}>
                Criar sessão de entrevista
              </Button>
            </div>
          )}
        </StepCard>

        <StepCard
          index={5}
          title="Exportar documentos"
          done={Boolean(session.exportedDocumentId)}
          active={!session.exportedDocumentId}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => handleExport('PDF')}
              loading={exportStep.isPending}
              disabled={exportStep.isPending}
            >
              Exportar PDF — 10 créditos
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('DOCX')}
              loading={exportStep.isPending}
              disabled={exportStep.isPending}
            >
              Exportar DOCX — 5 créditos
            </Button>
          </div>
        </StepCard>

        <StepCard
          index={6}
          title="Registar candidatura"
          done={Boolean(session.applicationId)}
          active={!session.applicationId}
        >
          {session.applicationId ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-success">Candidatura registada.</p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/applications/${session.applicationId}`}>
                  Ver candidatura
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Select
                value={finalStatus}
                onValueChange={(v) => setFinalStatus(v as ApplicationStatus)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(ApplicationStatus).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleFinalize} loading={finalize.isPending}>
                Registar candidatura
              </Button>
            </div>
          )}
        </StepCard>
      </div>
    </div>
  );
}
