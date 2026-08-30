'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles, Coins, ShieldCheck, Crown, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResumeVariantSelect } from '@/components/resume-variant-select';
import { ScoreBadge } from '@/components/score-badge';
import { TemplateSwatch } from '@/components/template-engine/TemplateSwatch';
import {
  useTemplateRecommendationHistory,
  useGenerateTemplateRecommendation,
  TEMPLATE_RECOMMENDATION_FEATURE_KEY,
  type TemplateRecommendation,
  type TemplateRecommendationItem,
} from '@/lib/api/template-recommendations';
import { useCreditEstimate } from '@/lib/api/career-advisor';
import { useJobTargets } from '@/lib/api/job-targets';
import { useResumeTemplate } from '@/lib/api/templates';
import { ApiError } from '@/lib/api-client';
import { formatRelativeTime, humanizeEnum } from '@/lib/format';

/** Full template details are always fetched fresh from the Template Engine's own API — never duplicated in the recommendation payload itself. */
function RecommendedTemplateCard({
  item,
  resumeVariantId,
}: {
  item: TemplateRecommendationItem;
  resumeVariantId: string | null;
}) {
  const router = useRouter();
  const { data: template, isLoading } = useResumeTemplate(item.templateId);

  if (isLoading || !template) {
    return <Skeleton className="h-32 w-full" />;
  }

  return (
    <Card className="flex flex-col overflow-hidden sm:flex-row">
      <div className="aspect-[3/4] w-full shrink-0 bg-muted/40 p-3 sm:w-32">
        <TemplateSwatch
          layout={template.layout}
          primaryColor={template.primaryColor}
          secondaryColor={template.secondaryColor}
        />
      </div>
      <CardContent className="flex-1 space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {item.rank}
            </span>
            <p className="font-semibold">{template.name}</p>
            <span className="text-xs text-muted-foreground">{humanizeEnum(template.category)}</span>
          </div>
          <ScoreBadge score={item.score} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {template.isATSFriendly && (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Compatível com ATS
            </Badge>
          )}
          {template.premium && (
            <Badge variant="warning" className="gap-1">
              <Crown className="h-3 w-3" />
              Premium
            </Badge>
          )}
        </div>

        <p className="text-sm text-muted-foreground">{item.reason}</p>

        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            router.push(
              resumeVariantId
                ? `/dashboard/resume-variants/${resumeVariantId}/template`
                : '/dashboard/resume-variants',
            )
          }
        >
          Ver este template
          <ArrowRight className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function RecommendationResult({ recommendation }: { recommendation: TemplateRecommendation }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recomendação gerada</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground">{recommendation.summary}</p>
        <div className="space-y-3">
          {recommendation.recommendations.map((item) => (
            <RecommendedTemplateCard
              key={item.templateId}
              item={item}
              resumeVariantId={recommendation.resumeVariantId}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function TemplateRecommendationsPage() {
  const [resumeVariantId, setResumeVariantId] = useState('');
  const [jobTargetId, setJobTargetId] = useState('');
  const [latestRecommendation, setLatestRecommendation] = useState<TemplateRecommendation | null>(
    null,
  );

  const { data: estimate } = useCreditEstimate(TEMPLATE_RECOMMENDATION_FEATURE_KEY);
  const { data: jobTargets } = useJobTargets();
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useTemplateRecommendationHistory();
  const generateRecommendation = useGenerateTemplateRecommendation();

  const insufficientBalance = estimate ? !estimate.sufficientBalance : false;

  async function handleGenerate() {
    try {
      const recommendation = await generateRecommendation.mutateAsync({
        resumeVariantId: resumeVariantId || undefined,
        jobTargetId: jobTargetId || undefined,
      });
      setLatestRecommendation(recommendation);
      toast.success('Recomendação de templates gerada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível gerar a recomendação.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recomendação de Templates"
        description="Estas são recomendações baseadas no seu perfil e objetivo profissional — a IA recomenda, a decisão é sempre sua."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Gerar recomendação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="resumeVariantId">Versão de currículo (opcional)</Label>
              <ResumeVariantSelect
                id="resumeVariantId"
                value={resumeVariantId}
                onChange={setResumeVariantId}
                requireJobTarget={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jobTargetId">Vaga alvo (opcional)</Label>
              <Select value={jobTargetId} onValueChange={setJobTargetId}>
                <SelectTrigger id="jobTargetId">
                  <SelectValue placeholder="Selecione uma vaga" />
                </SelectTrigger>
                <SelectContent>
                  {jobTargets?.length === 0 && (
                    <p className="p-2 text-xs text-muted-foreground">Nenhuma vaga guardada.</p>
                  )}
                  {jobTargets?.map((jt) => (
                    <SelectItem key={jt.id} value={jt.id}>
                      {jt.title}
                      {jt.company ? ` · ${jt.company}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary" className="gap-1">
              <Coins className="h-3.5 w-3.5" />
              {estimate ? `Custo: ${estimate.cost} créditos` : 'A calcular custo…'}
            </Badge>
            <Button
              onClick={handleGenerate}
              loading={generateRecommendation.isPending}
              disabled={insufficientBalance}
            >
              <Sparkles className="h-4 w-4" />
              Gerar recomendação
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

      {latestRecommendation && <RecommendationResult recommendation={latestRecommendation} />}

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
            icon={Sparkles}
            title="Ainda sem recomendações"
            description="Gere a sua primeira recomendação de templates acima."
          />
        ) : (
          <div className="space-y-3">
            {history.map((recommendation) => (
              <Card key={recommendation.id}>
                <CardContent className="space-y-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">
                      {recommendation.recommendations.length} template(s) recomendado(s)
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(recommendation.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {recommendation.summary}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
