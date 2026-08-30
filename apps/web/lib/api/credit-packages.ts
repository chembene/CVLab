import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';

export interface CreditPackage {
  id: string;
  priceMt: number;
  baseCredits: number;
  bonusCredits: number;
  totalCredits: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Read-only catalog — GET /credit-packages, self-service (Payments & Credits phase, Decision 3). */
export function useCreditPackages() {
  return useQuery({
    queryKey: ['credit-packages'],
    queryFn: () => apiFetch<CreditPackage[]>('/credit-packages'),
  });
}
