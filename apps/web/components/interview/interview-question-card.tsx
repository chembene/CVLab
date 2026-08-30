'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Lightbulb, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ScoreBadge } from '@/components/score-badge';
import { useSubmitInterviewAnswer, type InterviewQuestion } from '@/lib/api/interview';
import { humanizeEnum } from '@/lib/format';
import { ApiError } from '@/lib/api-client';

interface InterviewQuestionCardProps {
  sessionId: string;
  question: InterviewQuestion;
  locked: boolean;
}

/** One question in an interview session — the answer textarea + save button while `!locked` (session not yet evaluated), a read-only evaluation summary once it is. */
export function InterviewQuestionCard({ sessionId, question, locked }: InterviewQuestionCardProps) {
  const [answer, setAnswer] = useState(question.answer?.answer ?? '');
  const submitAnswer = useSubmitInterviewAnswer(sessionId);

  async function handleSave() {
    if (!answer.trim()) return;
    try {
      await submitAnswer.mutateAsync({ questionId: question.id, answer });
      toast.success('Resposta guardada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível guardar a resposta.');
    }
  }

  const evaluated = question.answer?.score != null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="outline">{question.order + 1}</Badge>
            <Badge variant="secondary">{humanizeEnum(question.category)}</Badge>
            {question.answer && !evaluated && (
              <Badge variant="warning" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Respondido
              </Badge>
            )}
          </div>
          <CardTitle className="text-base font-medium">{question.question}</CardTitle>
        </div>
        {evaluated && <ScoreBadge score={question.answer?.score} size="sm" />}
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={4}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={locked}
          placeholder="Escreva a sua resposta…"
        />
        {!locked && (
          <Button
            size="sm"
            onClick={handleSave}
            loading={submitAnswer.isPending}
            disabled={!answer.trim()}
          >
            <Save className="h-4 w-4" />
            Guardar resposta
          </Button>
        )}

        {evaluated && (
          <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
            {question.answer?.feedback && <p>{question.answer.feedback}</p>}
            {question.answer && question.answer.strengths.length > 0 && (
              <div>
                <p className="flex items-center gap-1 font-medium text-success">
                  <Lightbulb className="h-3.5 w-3.5" /> Pontos fortes
                </p>
                <ul className="ml-5 list-disc text-muted-foreground">
                  {question.answer.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {question.answer && question.answer.improvements.length > 0 && (
              <div>
                <p className="font-medium text-warning">A melhorar</p>
                <ul className="ml-5 list-disc text-muted-foreground">
                  {question.answer.improvements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Resposta ideal</summary>
              <p className="mt-1">{question.idealAnswer}</p>
            </details>
          </div>
        )}
        {!evaluated && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Dica</summary>
            <p className="mt-1">{question.tips}</p>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
