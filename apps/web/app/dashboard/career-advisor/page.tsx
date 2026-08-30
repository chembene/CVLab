'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Compass,
  Coins,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Lightbulb,
  ListChecks,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCareerAdviceHistory,
  useRequestCareerAdvice,
  useCreditEstimate,
  CAREER_ADVISOR_FEATURE_KEY,
  type CareerAdvice,
} from '@/lib/api/career-advisor';
import { ApiError } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';

const SUGGESTED_QUESTIONS = [
  'Quais são os meus principais pontos fortes?',
  'Que competências devo desenvolver?',
  'Que cargos devo procurar?',
  'Como posso melhorar o meu perfil profissional?',
  'Que passos devo tomar para atingir os meus objetivos de carreira?',
];

function AdviceResult({ advice }: { advice: CareerAdvice }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{advice.question}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-foreground">{advice.summary}</p>

        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
            Avaliação atual
          </p>
          <p className="text-sm text-muted-foreground">{advice.currentAssessment}</p>
        </div>

        {advice.strengths.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Pontos fortes
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {advice.strengths.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {advice.gaps.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Lacunas identificadas
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {advice.gaps.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {advice.recommendations.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Lightbulb className="h-4 w-4 text-primary" />
              Recomendações
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {advice.recommendations.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {advice.nextSteps.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <ListChecks className="h-4 w-4 text-primary" />
              Próximos passos
            </p>
            <ol className="space-y-1 text-sm text-muted-foreground">
              {advice.nextSteps.map((item, i) => (
                <li key={i}>
                  {i + 1}. {item}
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CareerAdvisorPage() {
  const [question, setQuestion] = useState('');
  const [latestAdvice, setLatestAdvice] = useState<CareerAdvice | null>(null);

  const { data: estimate } = useCreditEstimate(CAREER_ADVISOR_FEATURE_KEY);
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useCareerAdviceHistory();
  const requestAdvice = useRequestCareerAdvice();

  const trimmedQuestion = question.trim();
  const insufficientBalance = estimate ? !estimate.sufficientBalance : false;

  async function handleSubmit() {
    if (!trimmedQuestion) return;
    try {
      const advice = await requestAdvice.mutateAsync(trimmedQuestion);
      setLatestAdvice(advice);
      setQuestion('');
      toast.success('Recomendação gerada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível gerar a recomendação.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Career Advisor"
        description="Receba recomendações de carreira personalizadas, com base no seu perfil, currículo e histórico na plataforma."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Compass className="h-4 w-4 text-primary" />
            Pedir um conselho
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setQuestion(suggestion)}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>

          <Textarea
            rows={4}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Escreva a sua pergunta sobre a sua carreira…"
            aria-label="Pergunta para o Career Advisor"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary" className="gap-1">
              <Coins className="h-3.5 w-3.5" />
              {estimate ? `Custo: ${estimate.cost} créditos` : 'A calcular custo…'}
            </Badge>
            <Button
              onClick={handleSubmit}
              loading={requestAdvice.isPending}
              disabled={!trimmedQuestion || insufficientBalance}
            >
              <Sparkles className="h-4 w-4" />
              Pedir recomendação
            </Button>
          </div>

          {insufficientBalance && estimate && (
            <p role="alert" className="text-sm text-destructive">
              Saldo insuficiente: precisa de {estimate.cost} créditos, tem {estimate.currentBalance}
              .
            </p>
          )}
        </CardContent>
      </Card>

      {latestAdvice && <AdviceResult advice={latestAdvice} />}

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight text-foreground">
          Histórico de recomendações
        </h2>
        {historyLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : historyError ? (
          <ErrorState onRetry={() => refetchHistory()} />
        ) : !history || history.length === 0 ? (
          <EmptyState
            icon={Compass}
            title="Ainda sem recomendações"
            description="Peça o seu primeiro conselho de carreira acima."
          />
        ) : (
          <div className="space-y-3">
            {history.map((advice) => (
              <Card key={advice.id}>
                <CardContent className="space-y-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{advice.question}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(advice.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{advice.summary}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
