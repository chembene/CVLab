'use client';

import {
  FileText,
  ScanSearch,
  Sparkles,
  Mail,
  MessagesSquare,
  Wallet,
  History as HistoryIcon,
  Info,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/empty-state';

/**
 * Mock data — `GET /history` has no controller yet (see lib/api/history.ts's
 * `useHistoryEvents` for the real hook, written against the shape that
 * endpoint will return once built; every write side, via HistoryListener,
 * has existed since Phase 2A). Shown here as a static, clearly-labelled
 * timeline instead of silently pretending to be live data — see
 * docs/frontend/frontend-architecture.md "Mock data disclosure".
 */
const MOCK_EVENTS = [
  { id: '1', icon: MessagesSquare, label: 'Sessão de entrevista avaliada', time: 'Há 2 horas' },
  {
    id: '2',
    icon: Sparkles,
    label: 'Sugestões de otimização aplicadas ao currículo',
    time: 'Há 5 horas',
  },
  { id: '3', icon: Mail, label: 'Carta de apresentação gerada', time: 'Ontem' },
  { id: '4', icon: ScanSearch, label: 'Análise ATS executada', time: 'Ontem' },
  {
    id: '5',
    icon: Wallet,
    label: 'Créditos consumidos: Otimização de Currículo',
    time: 'Há 2 dias',
  },
  { id: '6', icon: FileText, label: 'Nova versão de currículo criada', time: 'Há 3 dias' },
];

export default function HistoryPage() {
  return (
    <div>
      <PageHeader title="Histórico" description="Registo de atividade na sua conta." />

      <Alert className="mb-6">
        <Info className="h-4 w-4" />
        <AlertTitle>Dados de demonstração</AlertTitle>
        <AlertDescription>
          O endpoint de histórico ainda não foi implementado no backend — esta página mostra dados
          de exemplo até essa funcionalidade estar disponível.
        </AlertDescription>
      </Alert>

      {MOCK_EVENTS.length === 0 ? (
        <EmptyState icon={HistoryIcon} title="Sem atividade" />
      ) : (
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {MOCK_EVENTS.map((event) => (
              <div key={event.id} className="flex items-center gap-4 p-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                  <event.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="flex-1 text-sm">{event.label}</p>
                <p className="shrink-0 text-xs text-muted-foreground">{event.time}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
