import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getConfidenceTier, hasConfidenceScore } from '@/lib/cv-import/confidence';
import type { CvFieldConfidence } from '@/lib/api/cv-import';

const TIER_CONFIG = {
  high: { variant: 'success' as const, icon: ShieldCheck, label: 'Alta confiança' },
  medium: { variant: 'warning' as const, icon: ShieldQuestion, label: 'Confiança média' },
  low: { variant: 'destructive' as const, icon: ShieldAlert, label: 'Verifique esta informação' },
};

/**
 * Only renders when the parser actually produced a confidence score for
 * this field (personalData.* only — see lib/cv-import/confidence.ts). For
 * every other field this renders nothing, not a fabricated "low confidence"
 * badge — an unscored field and a genuinely-uncertain one are not the same
 * thing, and conflating them would mislead the user during review.
 */
export function ConfidenceBadge({
  confidence,
  field,
}: {
  confidence: CvFieldConfidence | null | undefined;
  field: string;
}) {
  if (!hasConfidenceScore(confidence, field)) return null;
  const tier = getConfidenceTier(confidence, field);
  const { variant, icon: Icon, label } = TIER_CONFIG[tier];

  return (
    <Badge variant={variant} className="gap-1 text-xs font-normal">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}
