'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ClipboardList, Clock, ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { ScoreBadge } from '@/components/score-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTechnicalTests, useTestSessionHistory, useStartTestSession } from '@/lib/api/tests';
import { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';

const ALL_CATEGORIES = '__all__';

/**
 * FASE 23 — Technical Tests catalog + attempt history. "Iniciar Teste"
 * starts a brand-new attempt (retakes always allowed — every attempt is its
 * own row) and navigates straight to the session page, which handles both
 * the active-taking flow and the completed result view based on status.
 * Never hardcodes a price — this capability is deterministic and free (see
 * docs/architecture/technical-tests.md §7), so no credit-cost indicator
 * appears here at all, unlike every AI feature's own page.
 */
export default function TechnicalTestsPage() {
  const router = useRouter();
  const [category, setCategory] = useState<string>(ALL_CATEGORIES);
  const tests = useTechnicalTests(category === ALL_CATEGORIES ? undefined : category);
  const history = useTestSessionHistory();
  const startSession = useStartTestSession();

  const categories = useMemo(() => {
    const all = tests.data?.map((t) => t.category).filter((c): c is string => Boolean(c)) ?? [];
    return [...new Set(all)].sort();
  }, [tests.data]);

  async function handleStart(testId: string) {
    try {
      const session = await startSession.mutateAsync(testId);
      router.push(`/dashboard/technical-tests/${session.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível iniciar o teste.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Testes Técnicos"
        description="Pratique testes de múltipla escolha em várias áreas técnicas e profissionais."
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Testes disponíveis</CardTitle>
          {categories.length > 0 && (
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Todas as categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>Todas as categorias</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {tests.isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}

          {tests.isError && <ErrorState onRetry={() => tests.refetch()} />}

          {tests.data && tests.data.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="Sem testes disponíveis"
              description="Ainda não há testes técnicos disponíveis nesta categoria."
            />
          )}

          {tests.data && tests.data.length > 0 && (
            <ul className="space-y-3">
              {tests.data.map((test) => (
                <li
                  key={test.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-4"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{test.title}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {test.category && <Badge variant="outline">{test.category}</Badge>}
                      <span className="inline-flex items-center gap-1">
                        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
                        {test.questionCount} pergunta{test.questionCount === 1 ? '' : 's'}
                      </span>
                      {test.timeLimit !== null && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                          {test.timeLimit} min
                        </span>
                      )}
                    </div>
                  </div>
                  <Button onClick={() => handleStart(test.id)} loading={startSession.isPending}>
                    Iniciar Teste
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de tentativas</CardTitle>
        </CardHeader>
        <CardContent>
          {history.isLoading && <Skeleton className="h-20 w-full" />}
          {history.isError && <ErrorState onRetry={() => history.refetch()} />}
          {history.data && history.data.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="Ainda sem tentativas"
              description="As suas tentativas de testes técnicos vão aparecer aqui."
            />
          )}
          {history.data && history.data.length > 0 && (
            <ul className="space-y-2">
              {history.data.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/dashboard/technical-tests/${entry.id}`)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-left hover:bg-muted/50"
                  >
                    <div className="space-y-0.5">
                      <p className="font-medium">
                        {entry.testTitle}{' '}
                        <span className="text-xs text-muted-foreground">
                          (tentativa {entry.attemptNumber})
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(entry.startedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={entry.status} />
                      {entry.timedOut && <Badge variant="outline">Tempo esgotado</Badge>}
                      {entry.status === 'COMPLETED' && <ScoreBadge score={entry.score} size="sm" />}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
