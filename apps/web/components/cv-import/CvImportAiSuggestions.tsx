'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Check, Sparkles, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/empty-state';
import { getEntryConfidenceTier } from '@/lib/cv-import/confidence';
import { applyCvImportAiSuggestion } from '@/lib/cv-import/apply-ai-suggestion';
import { useCreditEstimate } from '@/lib/api/career-advisor';
import { CV_IMPORT_AI_FEATURE_KEY, useEnhanceCvImportWithAi } from '@/lib/api/cv-import';
import type { CvImport, CvImportAiSuggestion, ExtractedCvData } from '@/lib/api/cv-import';
import { ApiError } from '@/lib/api-client';

const CONFIDENCE_TIER_LABEL = {
  high: 'Confiança alta',
  medium: 'Confiança média',
  low: 'Confiança baixa',
};
const CONFIDENCE_TIER_VARIANT = {
  high: 'success' as const,
  medium: 'warning' as const,
  low: 'destructive' as const,
};

/** A field/section label the user recognizes — mirrors the section labels already used throughout CvImportReview.tsx (kept independent, not imported, since these are display-only strings, not logic). */
const SECTION_LABELS: Record<string, string> = {
  personalData: 'Dados pessoais',
  summary: 'Resumo',
  workExperiences: 'Experiência profissional',
  educations: 'Formação académica',
  skills: 'Competências',
  languages: 'Idiomas',
  certificates: 'Certificações',
  projects: 'Projetos',
  awards: 'Prémios',
  volunteerExperiences: 'Voluntariado',
  references: 'Referências',
};

export interface CvImportAiSuggestionsProps {
  cvImportId: string;
  reviewData: ExtractedCvData;
  onChange: (next: ExtractedCvData) => void;
  aiSuggestions: CvImportAiSuggestion[] | null | undefined;
  aiUnresolvedFields: string[] | null | undefined;
  /** Called with the fresh CvImport row once enhance() succeeds, so the parent page's own cvImport state (and this component's aiSuggestions/aiUnresolvedFields props) reflect the result — same "mutation result flows back into parent state" pattern the page already uses for confirm()/upload(). */
  onEnhanced: (updated: CvImport) => void;
}

/**
 * FASE 22 — CV Import AI / Intelligent Extraction Engine. A self-contained
 * panel rendered alongside (never inside) CvImportReview.tsx, so the
 * pre-existing, already-tested review component stays completely untouched
 * (per this phase's own "preserve CV Import" rule). Before enhancement runs,
 * shows a "Melhorar com IA" button with its live credit cost (never
 * hardcoded — see useCreditEstimate()). Once suggestions exist, each one is
 * an explicit Aceitar/Rejeitar choice — accepting calls
 * applyCvImportAiSuggestion() to fold the suggestedValue into the SAME
 * reviewData state CvImportReview already edits, so the existing, unmodified
 * confirm() flow is still the only thing that ever writes to the Master
 * Resume. The AI never applies anything itself.
 */
export function CvImportAiSuggestions({
  cvImportId,
  reviewData,
  onChange,
  aiSuggestions,
  aiUnresolvedFields,
  onEnhanced,
}: CvImportAiSuggestionsProps) {
  const estimate = useCreditEstimate(CV_IMPORT_AI_FEATURE_KEY);
  const enhance = useEnhanceCvImportWithAi(cvImportId);
  // Local-only bookkeeping of which suggestion the user already acted on —
  // keyed by array index, since suggestions have no id of their own (they're
  // never individually persisted/mutated server-side, only the whole array
  // is). Purely a display concern: reviewData itself is the real source of
  // truth for what will actually be confirmed.
  const [decided, setDecided] = useState<Record<number, 'accepted' | 'rejected'>>({});

  async function handleEnhance() {
    try {
      const updated = await enhance.mutateAsync();
      onEnhanced(updated);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível melhorar com IA.');
    }
  }

  function handleAccept(index: number, suggestion: CvImportAiSuggestion) {
    onChange(applyCvImportAiSuggestion(reviewData, suggestion));
    setDecided((prev) => ({ ...prev, [index]: 'accepted' }));
  }

  function handleReject(index: number) {
    setDecided((prev) => ({ ...prev, [index]: 'rejected' }));
  }

  if (!aiSuggestions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
            Melhorar com IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A IA pode sugerir normalizações e melhorias para os campos já extraídos do seu CV (nunca
            inventa factos novos — apenas revê o que já foi encontrado). Vai poder aceitar ou
            rejeitar cada sugestão individualmente.
          </p>
          {estimate.data && !estimate.data.sufficientBalance && (
            <Alert variant="warning">
              <AlertTitle>Saldo insuficiente</AlertTitle>
              <AlertDescription>
                Precisa de {estimate.data.cost} créditos para usar esta funcionalidade. Saldo atual:{' '}
                {estimate.data.currentBalance}.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-3">
            <Button
              onClick={handleEnhance}
              loading={enhance.isPending}
              disabled={estimate.data ? !estimate.data.sufficientBalance : false}
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              Melhorar com IA
            </Button>
            {estimate.data && (
              <span className="text-sm text-muted-foreground">
                Custo: {estimate.data.cost} créditos
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Sugestões da IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {aiSuggestions.length === 0 && (aiUnresolvedFields?.length ?? 0) === 0 && (
          <EmptyState
            icon={Sparkles}
            title="Nada a melhorar"
            description="O seu CV já está bem estruturado — não há sugestões neste momento."
          />
        )}

        {aiSuggestions.length > 0 && (
          <ul className="space-y-3">
            {aiSuggestions.map((suggestion, index) => {
              const tier = getEntryConfidenceTier(suggestion.confidence);
              const status = decided[index];
              return (
                <li
                  key={`${suggestion.section}-${suggestion.index ?? 'x'}-${suggestion.field}-${index}`}
                  className="space-y-2 rounded-md border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {SECTION_LABELS[suggestion.section] ?? suggestion.section} —{' '}
                      {suggestion.field}
                    </p>
                    {tier && (
                      <Badge
                        variant={CONFIDENCE_TIER_VARIANT[tier]}
                        className="text-xs font-normal"
                      >
                        {CONFIDENCE_TIER_LABEL[tier]}
                      </Badge>
                    )}
                    {status === 'accepted' && (
                      <Badge variant="success" className="text-xs font-normal">
                        Aplicado
                      </Badge>
                    )}
                    {status === 'rejected' && (
                      <Badge variant="outline" className="text-xs font-normal">
                        Rejeitado
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{suggestion.reason}</p>
                  <p className="text-sm text-destructive line-through">
                    {suggestion.originalValue}
                  </p>
                  <p className="text-sm text-success">{suggestion.suggestedValue}</p>
                  {!status && (
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={() => handleAccept(index, suggestion)}>
                        <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Aceitar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleReject(index)}>
                        <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Rejeitar
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {(aiUnresolvedFields?.length ?? 0) > 0 && (
          <Alert>
            <AlertTitle>Campos que precisam da sua atenção</AlertTitle>
            <AlertDescription>
              <ul className="list-inside list-disc space-y-0.5">
                {aiUnresolvedFields!.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
