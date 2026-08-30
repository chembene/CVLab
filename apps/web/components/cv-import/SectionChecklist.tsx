import { AlertCircle, AlertTriangle, CheckCircle2, Circle } from 'lucide-react';
import type { SectionStatus, SectionStatusItem } from '@/lib/cv-import/section-status';

const STATUS_CONFIG: Record<
  SectionStatus,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  found: { icon: CheckCircle2, className: 'text-success', label: 'Encontrado' },
  partial: { icon: AlertTriangle, className: 'text-warning', label: 'Encontrado parcialmente' },
  needs_review: { icon: AlertCircle, className: 'text-destructive', label: 'Precisa de revisão' },
  not_found: { icon: Circle, className: 'text-muted-foreground', label: 'Não encontrado' },
};

/**
 * FASE 6 audit (2026-08-12) — the review screen's top-of-page summary: lets
 * the user see at a glance what the parser found before scrolling through
 * every section's full editable form. Every status comes from
 * `computeSectionStatuses()` (real data only — an empty section is never
 * shown as found).
 */
export function SectionChecklist({ items }: { items: SectionStatusItem[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2" aria-label="Resumo da importação">
      {items.map((item) => {
        const { icon: Icon, className, label } = STATUS_CONFIG[item.status];
        return (
          <li key={item.key} className="flex items-center gap-2 text-sm">
            <Icon className={`h-4 w-4 shrink-0 ${className}`} aria-hidden="true" />
            <span className="text-foreground">{item.label}</span>
            <span className={`ml-auto text-xs ${className}`}>{label}</span>
          </li>
        );
      })}
    </ul>
  );
}
