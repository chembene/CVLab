'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

/**
 * Mock data — no analytics/usage-over-time endpoint exists in any backend
 * phase (Analytics is still a conceptual module in
 * docs/architecture/module-boundaries.md, not implemented). Shaped like a
 * plausible future `GET /credits/usage?range=weekly` response so swapping in
 * a real query later only touches this file's data source, not its
 * rendering — see docs/frontend/frontend-architecture.md "Mock data
 * disclosure".
 */
const MOCK_WEEKLY_USAGE = [
  { label: 'Seg', credits: 20 },
  { label: 'Ter', credits: 45 },
  { label: 'Qua', credits: 10 },
  { label: 'Qui', credits: 60 },
  { label: 'Sex', credits: 35 },
  { label: 'Sáb', credits: 5 },
  { label: 'Dom', credits: 15 },
];

export function UsageChart() {
  const max = Math.max(...MOCK_WEEKLY_USAGE.map((d) => d.credits), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Consumo de Créditos</CardTitle>
        <CardDescription>Últimos 7 dias</CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className="flex h-40 items-end gap-3"
          role="img"
          aria-label="Gráfico de consumo de créditos nos últimos 7 dias"
        >
          {MOCK_WEEKLY_USAGE.map((day) => (
            <div
              key={day.label}
              className="flex h-full flex-1 flex-col items-center justify-end gap-2"
            >
              <div
                className="w-full rounded-t-sm bg-primary/80 transition-all"
                style={{ height: `${Math.max((day.credits / max) * 100, 4)}%` }}
                title={`${day.credits} créditos`}
              />
              <span className="text-xs text-muted-foreground">{day.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
