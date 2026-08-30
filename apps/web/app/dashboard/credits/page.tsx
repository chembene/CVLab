'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Coins, Receipt, Search, ShoppingCart, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWallet } from '@/lib/api/credits';
import { useCreditPackages } from '@/lib/api/credit-packages';
import { useCreatePayment } from '@/lib/api/payments';
import { apiFetch, ApiError } from '@/lib/api-client';

interface EstimateResult {
  featureKey: string;
  cost: number;
  currentBalance: number;
  sufficientBalance: boolean;
  balanceAfter: number;
}

const FEATURE_COSTS = [
  { key: 'resume_optimization', label: 'Otimização de Currículo' },
  { key: 'cover_letter', label: 'Carta de Apresentação' },
  { key: 'interview_questions', label: 'Geração de Perguntas de Entrevista' },
  { key: 'interview_evaluation', label: 'Avaliação de Entrevista' },
];

export default function CreditsPage() {
  const { data: wallet, isLoading } = useWallet();
  const { data: packages, isLoading: packagesLoading } = useCreditPackages();
  const createPayment = useCreatePayment();
  const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null);
  const [featureKey, setFeatureKey] = useState(FEATURE_COSTS[0]!.key);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [checking, setChecking] = useState(false);

  async function handlePurchase(packageId: string) {
    setPurchasingPackageId(packageId);
    try {
      // The backend is the sole authority here — this only ever reflects
      // what POST /payments actually returned; nothing is assumed
      // successful client-side, and the wallet/transactions queries are
      // only invalidated once a later verify() call (or a real webhook)
      // confirms completion — see useCreatePayment()/useVerifyPayment().
      await createPayment.mutateAsync({ packageId, provider: 'MPESA' });
      toast.success('Pagamento iniciado. Siga as instruções da M-Pesa para concluir.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível iniciar o pagamento.');
    } finally {
      setPurchasingPackageId(null);
    }
  }

  async function handleEstimate() {
    setChecking(true);
    try {
      const result = await apiFetch<EstimateResult>('/credits/estimate', {
        method: 'POST',
        body: JSON.stringify({ featureKey }),
      });
      setEstimate(result);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível estimar o custo.');
      setEstimate(null);
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Créditos"
        description="Saldo disponível e custo estimado de cada funcionalidade de IA."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Créditos disponíveis"
          value={wallet?.availableCredits ?? 0}
          icon={Wallet}
          loading={isLoading}
          tone="primary"
        />
        <StatCard
          label="Total comprado"
          value={wallet?.lifetimePurchased ?? 0}
          icon={Receipt}
          loading={isLoading}
        />
        <StatCard
          label="Total consumido"
          value={wallet?.lifetimeConsumed ?? 0}
          icon={Receipt}
          loading={isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comprar créditos</CardTitle>
          <CardDescription>
            Pague com M-Pesa e receba os créditos assim que o pagamento for confirmado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {packagesLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : !packages || packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum pacote de créditos disponível de momento.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((pkg) => (
                <Card key={pkg.id}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-2">
                      <Coins className="h-4 w-4 text-primary" />
                      <p className="text-2xl font-semibold">{pkg.totalCredits}</p>
                      <span className="text-sm text-muted-foreground">créditos</span>
                    </div>
                    {pkg.bonusCredits > 0 && (
                      <p className="text-xs text-success">
                        Inclui {pkg.bonusCredits} créditos de bónus
                      </p>
                    )}
                    <p className="text-lg font-medium">{pkg.priceMt} MT</p>
                    <Button
                      className="w-full"
                      onClick={() => handlePurchase(pkg.id)}
                      loading={purchasingPackageId === pkg.id}
                      disabled={purchasingPackageId !== null}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      Comprar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estimar custo</CardTitle>
          <CardDescription>
            Veja quantos créditos uma funcionalidade de IA vai consumir antes de a usar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="feature">Funcionalidade</Label>
              <Select value={featureKey} onValueChange={setFeatureKey}>
                <SelectTrigger id="feature">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_COSTS.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleEstimate} loading={checking}>
              <Search className="h-4 w-4" />
              Estimar
            </Button>
          </div>

          {estimate && (
            <Alert variant={estimate.sufficientBalance ? 'success' : 'destructive'}>
              <AlertTitle>{estimate.cost} créditos</AlertTitle>
              <AlertDescription>
                Saldo atual: {estimate.currentBalance} · Saldo após uso: {estimate.balanceAfter}
                {!estimate.sufficientBalance && ' — saldo insuficiente.'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/dashboard/transactions">Ver histórico de transações</Link>
        </Button>
      </div>
    </div>
  );
}
