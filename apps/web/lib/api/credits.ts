import { useQuery } from '@tanstack/react-query';
import type { PaginatedResult } from '@cvlab/types';
import { apiFetch } from '@/lib/api-client';

export interface CreditWallet {
  id: string;
  userId: string;
  availableCredits: number;
  lifetimePurchased: number;
  lifetimeConsumed: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: string;
  balanceBefore: number;
  balanceAfter: number;
  reference?: string | null;
  description?: string | null;
  actor?: string | null;
  createdAt: string;
}

export function useWallet() {
  return useQuery({
    queryKey: ['credits', 'wallet'],
    queryFn: () => apiFetch<CreditWallet>('/credits'),
  });
}

export function useCreditTransactions(page = 1, limit = 20) {
  return useQuery({
    queryKey: ['credits', 'transactions', page, limit],
    queryFn: () =>
      apiFetch<PaginatedResult<CreditTransaction>>(
        `/credits/transactions?page=${page}&limit=${limit}`,
      ),
  });
}
