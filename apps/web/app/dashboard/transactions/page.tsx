'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCreditTransactions } from '@/lib/api/credits';
import { formatDateTime, humanizeEnum } from '@/lib/format';

const POSITIVE_TYPES = new Set(['PURCHASE', 'BONUS', 'REFUND', 'REVERSAL', 'PROMOTION']);

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useCreditTransactions(page, 20);

  return (
    <div>
      <PageHeader
        title="Transações"
        description="Histórico completo de movimentos na sua carteira de créditos."
      />

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nenhuma transação"
          description="Ainda não existem movimentos na sua carteira."
        />
      ) : (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((transaction) => (
                <TableRow key={transaction.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDateTime(transaction.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{humanizeEnum(transaction.type)}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {transaction.description ?? '—'}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${POSITIVE_TYPES.has(transaction.type) ? 'text-success' : 'text-destructive'}`}
                  >
                    {transaction.amount > 0 ? '+' : ''}
                    {transaction.amount}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {transaction.balanceAfter}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Página {data.page} de {data.totalPages} · {data.total} transações
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Seguinte
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
