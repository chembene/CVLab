'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { IdCard, Coins, Sparkles, MessageSquareQuote, Briefcase, Lightbulb } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useLinkedInProfileHistory,
  useGenerateLinkedInProfile,
  LINKEDIN_FEATURE_KEY,
  type LinkedInProfile,
} from '@/lib/api/linkedin';
import { useCreditEstimate } from '@/lib/api/career-advisor';
import { ApiError } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';

function LinkedInProfileResult({ profile }: { profile: LinkedInProfile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{profile.targetRole ?? 'Perfil otimizado'}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
            <MessageSquareQuote className="h-4 w-4 text-primary" />
            Headline
          </p>
          <p className="text-sm text-foreground">{profile.headline}</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-foreground">About</p>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{profile.about}</p>
        </div>

        {profile.skills.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-foreground">Competências sugeridas</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.map((skill, i) => (
                <Badge key={i} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {profile.experienceSuggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Briefcase className="h-4 w-4 text-primary" />
              Sugestões de experiência
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {profile.experienceSuggestions.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </div>
        )}

        {profile.recommendations.length > 0 && (
          <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Lightbulb className="h-4 w-4 text-warning" />
              Recomendações para o perfil
            </p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {profile.recommendations.map((item, i) => (
                <li key={i}>• {item}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LinkedInPage() {
  const [targetRole, setTargetRole] = useState('');
  const [latestProfile, setLatestProfile] = useState<LinkedInProfile | null>(null);

  const { data: estimate } = useCreditEstimate(LINKEDIN_FEATURE_KEY);
  const {
    data: history,
    isLoading: historyLoading,
    isError: historyError,
    refetch: refetchHistory,
  } = useLinkedInProfileHistory();
  const generateProfile = useGenerateLinkedInProfile();

  const insufficientBalance = estimate ? !estimate.sufficientBalance : false;

  async function handleGenerate() {
    try {
      const profile = await generateProfile.mutateAsync(targetRole.trim() || undefined);
      setLatestProfile(profile);
      toast.success('Perfil LinkedIn gerado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível gerar o perfil.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfil LinkedIn"
        description="Transforme os dados do seu currículo num perfil profissional otimizado para o LinkedIn — headline, About, competências e sugestões de experiência."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <IdCard className="h-4 w-4 text-primary" />
            Gerar perfil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="targetRole">Cargo-alvo (opcional)</Label>
            <Input
              id="targetRole"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder="Ex.: Engenheiro de Backend Sénior"
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para uma otimização geral com base no seu currículo e vagas alvo.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="secondary" className="gap-1">
              <Coins className="h-3.5 w-3.5" />
              {estimate ? `Custo: ${estimate.cost} créditos` : 'A calcular custo…'}
            </Badge>
            <Button
              onClick={handleGenerate}
              loading={generateProfile.isPending}
              disabled={insufficientBalance}
            >
              <Sparkles className="h-4 w-4" />
              Gerar perfil
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

      {latestProfile && <LinkedInProfileResult profile={latestProfile} />}

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight text-foreground">
          Histórico de perfis gerados
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
            icon={IdCard}
            title="Ainda sem perfis gerados"
            description="Gere o seu primeiro perfil LinkedIn otimizado acima."
          />
        ) : (
          <div className="space-y-3">
            {history.map((profile) => (
              <Card key={profile.id}>
                <CardContent className="space-y-1 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{profile.targetRole ?? 'Otimização geral'}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(profile.createdAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{profile.headline}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
