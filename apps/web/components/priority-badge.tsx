import { Badge, type BadgeProps } from '@/components/ui/badge';
import { SuggestionPriority } from '@cvlab/types';
import { humanizeEnum } from '@/lib/format';

const VARIANT_BY_PRIORITY: Record<SuggestionPriority, BadgeProps['variant']> = {
  [SuggestionPriority.LOW]: 'secondary',
  [SuggestionPriority.MEDIUM]: 'outline',
  [SuggestionPriority.HIGH]: 'warning',
  [SuggestionPriority.CRITICAL]: 'destructive',
};

export function PriorityBadge({ priority }: { priority: SuggestionPriority }) {
  return <Badge variant={VARIANT_BY_PRIORITY[priority]}>{humanizeEnum(priority)}</Badge>;
}
