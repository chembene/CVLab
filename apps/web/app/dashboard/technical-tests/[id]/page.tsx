'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, CheckCircle2, Clock, Send, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { ScoreBadge } from '@/components/score-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useTestSession, useSubmitTestAnswer, useCompleteTestSession } from '@/lib/api/tests';
import type { SanitizedTestQuestion } from '@/lib/api/tests';
import { ApiError } from '@/lib/api-client';

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

interface QuestionCardProps {
  question: SanitizedTestQuestion;
  index: number;
  locked: boolean;
  onSelect: (choice: string) => void;
  pending: boolean;
}

function QuestionCard({ question, index, locked, onSelect, pending }: QuestionCardProps) {
  const revealed = question.correctAnswer !== undefined;

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium">
            {index + 1}. {question.prompt}
          </p>
          {revealed &&
            (question.isCorrect ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-label="Correto" />
            ) : (
              <XCircle className="h-5 w-5 shrink-0 text-destructive" aria-label="Incorreto" />
            ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {question.choices.map((choice) => {
            const isSelected = question.selectedAnswer === choice;
            const isCorrectChoice = revealed && choice === question.correctAnswer;
            return (
              <button
                key={choice}
                type="button"
                disabled={locked || pending}
                onClick={() => onSelect(choice)}
                className={cn(
                  'flex items-center justify-between gap-2 rounded-md border p-3 text-left text-sm transition-colors',
                  isSelected && !revealed && 'border-primary bg-primary/5',
                  revealed && isCorrectChoice && 'border-success bg-success/10',
                  revealed &&
                    isSelected &&
                    !isCorrectChoice &&
                    'border-destructive bg-destructive/10',
                  !isSelected && !isCorrectChoice && 'border-border',
                  (locked || pending) && 'cursor-not-allowed opacity-80',
                )}
              >
                <span>{choice}</span>
                {isSelected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {revealed && question.explanation && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Explicação: </span>
            {question.explanation}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * FASE 23 — handles both the active-taking flow and the completed result
 * view for one TestSession, based on its own `status` (same pattern
 * Interview's `[id]/page.tsx` already established). The visible countdown
 * here is a client-side DISPLAY convenience only, seeded from the server's
 * own `remainingSeconds` and ticking down locally — the server independently
 * rejects a late answer regardless of what this countdown shows (see
 * docs/architecture/technical-tests.md §6): never trust a client timer for
 * anything security-sensitive.
 */
export default function TechnicalTestSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session, isLoading, isError, refetch } = useTestSession(id);
  const submitAnswer = useSubmitTestAnswer(id);
  const completeSession = useCompleteTestSession(id);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);

  useEffect(() => {
    if (session?.remainingSeconds != null) {
      setSecondsLeft(session.remainingSeconds);
    }
  }, [session?.remainingSeconds]);

  useEffect(() => {
    if (secondsLeft === null || session?.status !== 'IN_PROGRESS') return;
    if (secondsLeft <= 0) {
      setTimeUp(true);
      // The countdown is display-only: ask the server for the authoritative
      // state, which now reports this attempt as EXPIRED.
      void refetch();
      return;
    }
    const timer = setInterval(() => setSecondsLeft((s) => (s !== null ? s - 1 : s)), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft, session?.status, refetch]);

  async function handleSelect(questionId: string, selectedAnswer: string) {
    try {
      await submitAnswer.mutateAsync({ questionId, selectedAnswer });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível guardar a resposta.');
    }
  }

  async function handleComplete() {
    try {
      await completeSession.mutateAsync();
      toast.success('Teste submetido.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível submeter o teste.');
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

  const isCompleted = session.status === 'COMPLETED';
  const isExpired = session.status === 'EXPIRED';
  const isFinished = isCompleted || isExpired;
  const answeredCount = session.questions.filter((q) => q.selectedAnswer !== null).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={session.test.title}
        description={`Tentativa ${session.attemptNumber}`}
        breadcrumbs={[
          { label: 'Testes Técnicos', href: '/dashboard/technical-tests' },
          { label: 'Sessão' },
        ]}
        actions={
          <>
            {session.test.category && <Badge variant="outline">{session.test.category}</Badge>}
            <StatusBadge status={session.status} />
          </>
        }
      />

      {isCompleted && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <ScoreBadge score={session.score} size="lg" />
            <p className="text-sm text-muted-foreground">Resultado final</p>
          </CardContent>
        </Card>
      )}

      {isExpired && (
        <Alert variant="destructive">
          <Clock className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Tentativa expirada</AlertTitle>
          <AlertDescription role="status">
            O tempo para este teste terminou. Esta tentativa já não aceita respostas nem submissão —
            inicie uma nova tentativa para voltar a praticar.
          </AlertDescription>
        </Alert>
      )}

      {!isFinished && secondsLeft !== null && (
        <Alert variant={timeUp ? 'destructive' : secondsLeft < 60 ? 'warning' : 'default'}>
          <Clock className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>{timeUp ? 'Tempo esgotado' : 'Tempo restante'}</AlertTitle>
          <AlertDescription role="status">
            {timeUp ? 'O tempo para este teste terminou.' : formatClock(secondsLeft)}
          </AlertDescription>
        </Alert>
      )}

      {!isFinished && (
        <p className="text-sm text-muted-foreground">
          {answeredCount} de {session.questions.length} perguntas respondidas.
        </p>
      )}

      <div className="space-y-4">
        {session.questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            locked={isFinished}
            pending={submitAnswer.isPending}
            onSelect={(choice) => handleSelect(question.id, choice)}
          />
        ))}
      </div>

      {!isFinished && (
        <div className="flex justify-end">
          <Button onClick={handleComplete} disabled={timeUp} loading={completeSession.isPending}>
            <Send className="mr-2 h-4 w-4" aria-hidden="true" />
            Submeter Teste
          </Button>
        </div>
      )}

      {isFinished && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => router.push('/dashboard/technical-tests')}>
            Voltar aos Testes Técnicos
          </Button>
        </div>
      )}
    </div>
  );
}
