import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Consistent 0-100 score chip reused by ATS reports, Resume Optimization predictions, and Interview scores — color reflects the same three-tier thresholds everywhere in the app. */
export function ScoreBadge({ score, size = 'md', className }: ScoreBadgeProps) {
  const value = score ?? 0;
  const tone =
    value >= 75
      ? 'bg-success/10 text-success'
      : value >= 50
        ? 'bg-warning/10 text-warning'
        : 'bg-destructive/10 text-destructive';
  const sizeClass =
    size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-16 w-16 text-xl' : 'h-11 w-11 text-sm';

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        sizeClass,
        tone,
        className,
      )}
      aria-label={`Pontuação: ${score ?? '—'}`}
    >
      {score ?? '—'}
    </div>
  );
}
