import { Badge, type BadgeProps } from '@/components/ui/badge';
import { humanizeEnum } from '@/lib/format';

// ApplicationStatus (SAVED/APPLIED/INTERVIEW/OFFER/REJECTED/WITHDRAWN/ARCHIVED)
// joins these sets rather than getting its own mapping — OFFER reads as a
// win (success), REJECTED/WITHDRAWN read as negative outcomes, APPLIED/
// INTERVIEW read as "in progress" (same tone as PENDING/IN_PROGRESS
// elsewhere), and SAVED (a draft, not yet submitted) falls through to the
// existing neutral `secondary` default rather than needing a fourth tier.
const POSITIVE = new Set(['COMPLETED', 'GENERATED', 'READY', 'SUCCEEDED', 'ACTIVE', 'OFFER']);
const NEGATIVE = new Set(['FAILED', 'ARCHIVED', 'CANCELLED', 'EXPIRED', 'REJECTED', 'WITHDRAWN']);
const NEUTRAL_WARNING = new Set([
  'PENDING',
  'IN_PROGRESS',
  'DRAFT',
  'EDITED',
  'APPLIED',
  'INTERVIEW',
]);

/** Maps any backend status string to a consistent badge tone across every list/detail page — new statuses fall back to `secondary` rather than crashing. */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  let variant: BadgeProps['variant'] = 'secondary';
  if (POSITIVE.has(status)) variant = 'success';
  else if (NEGATIVE.has(status)) variant = 'destructive';
  else if (NEUTRAL_WARNING.has(status)) variant = 'warning';

  return (
    <Badge variant={variant} className={className}>
      {humanizeEnum(status)}
    </Badge>
  );
}
