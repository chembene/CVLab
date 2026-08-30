'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardList, Sparkles, Trash2 } from 'lucide-react';
import { InterviewMode } from '@cvlab/types';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { ScoreBadge } from '@/components/score-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { InterviewQuestionCard } from '@/components/interview/interview-question-card';
import {
  useInterview,
  useGenerateInterviewQuestions,
  useEvaluateInterview,
  useDeleteInterview,
} from '@/lib/api/interview';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, humanizeEnum } from '@/lib/format';

/** FASE 11 — short PT label for the session's mode, shown next to the status badge. */
const MODE_LABEL: Record<InterviewMode, string> = {
  [InterviewMode.RESUME]: 'Modo: CV',
  [InterviewMode.JOB]: 'Modo: Vaga',
  [InterviewMode.ROLE]: 'Modo: Cargo',
};

export default function InterviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isLoading, isError, refetch } = useInterview(id);
  const generateQuestions = useGenerateInterviewQuestions(id);
  const evaluateInterview = useEvaluateInterview(id);
  const deleteInterview = useDeleteInterview();
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleGenerateQuestions() {
    try {
      await generateQuestions.mutateAsync(undefined);
      toast.success('Perguntas geradas.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível gerar as perguntas.');
    }
  }

  async function handleEvaluate() {
    try {
      await evaluateInterview.mutateAsync();
      toast.success('Avaliação concluída.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível concluir a avaliação.');
    }
  }

  async function handleDelete() {
    try {
      await deleteInterview.mutateAsync(id);
      toast.success('Sessão removida.');
      router.push('/dashboard/interviews');
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

  if (isError || !session) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  const allAnswered = session.questions.length > 0 && session.questions.every((q) => q.answer);
  const isCompleted = session.status === 'COMPLETED';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${humanizeEnum(session.type)} · ${humanizeEnum(session.difficulty)}`}
        description={formatDateTime(session.createdAt)}
        breadcrumbs={[
          { label: 'Entrevistas', href: '/dashboard/interviews' },
          { label: 'Detalhe' },
        ]}
        actions={
          <>
            <Badge variant="outline">{MODE_LABEL[session.mode]}</Badge>
            <StatusBadge status={session.status} />
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

      {isCompleted && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="flex flex-col items-center gap-2 p-4 text-center">
            <ScoreBadge score={session.overallScore} />
            <p className="text-xs text-muted-foreground">Geral</p>
          </Card>
          <Card className="flex flex-col items-center gap-2 p-4 text-center">
            <ScoreBadge score={session.technicalScore} />
            <p className="text-xs text-muted-foreground">Técnico</p>
          </Card>
          <Card className="flex flex-col items-center gap-2 p-4 text-center">
            <ScoreBadge score={session.communicationScore} />
            <p className="text-xs text-muted-foreground">Comunicação</p>
          </Card>
          <Card className="flex flex-col items-center gap-2 p-4 text-center">
            <ScoreBadge score={session.confidenceScore} />
            <p className="text-xs text-muted-foreground">Confiança</p>
          </Card>
        </div>
      )}

      {session.questions.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Ainda sem perguntas"
          description="Gere as perguntas de entrevista com base no seu currículo e na vaga alvo."
          action={
            <Button onClick={handleGenerateQuestions} loading={generateQuestions.isPending}>
              <Sparkles className="h-4 w-4" />
              Gerar perguntas
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-4">
            {session.questions
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((question) => (
                <InterviewQuestionCard
                  key={question.id}
                  sessionId={id}
                  question={question}
                  locked={isCompleted}
                />
              ))}
          </div>

          {!isCompleted && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Avaliação</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  {allAnswered
                    ? 'Todas as perguntas foram respondidas. Pode agora pedir a avaliação da IA.'
                    : 'Responda a todas as perguntas antes de pedir a avaliação.'}
                </p>
                <Button
                  onClick={handleEvaluate}
                  loading={evaluateInterview.isPending}
                  disabled={!allAnswered}
                >
                  <Sparkles className="h-4 w-4" />
                  Avaliar respostas
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar esta sessão de entrevista?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
