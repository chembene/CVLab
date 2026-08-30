import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export type PaymentProvider = 'MPESA';
export type PaymentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REVERSED'
  | 'REFUNDED';

export interface Payment {
  id: string;
  userId: string;
  packageId: string;
  provider: PaymentProvider;
  providerReference?: string | null;
  amount: string;
  currency: string;
  status: PaymentStatus;
  metadata?: { redirectUrl?: string; failureReason?: string } | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export function usePayments() {
  return useQuery({ queryKey: ['payments'], queryFn: () => apiFetch<Payment[]>('/payments') });
}

/**
 * The backend is the sole authority on whether a payment succeeded — this
 * hook only ever surfaces what POST /payments/:id/verify or the wallet
 * query (once invalidated) already confirmed. The frontend never infers
 * success from a redirect, a screenshot, or a timeout.
 */
export function useCreatePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { packageId: string; provider: PaymentProvider }) =>
      apiFetch<Payment>('/payments', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payments'] }),
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<Payment>(`/payments/${id}/verify`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'wallet'] });
      queryClient.invalidateQueries({ queryKey: ['credits', 'transactions'] });
    },
  });
}
