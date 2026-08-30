'use client';

import Link from 'next/link';
import {
  Wallet,
  ScanSearch,
  Sparkles,
  Mail,
  MessagesSquare,
  Target,
  Plus,
  ArrowRight,
  UploadCloud,
} from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RecentListCard, type RecentListItem } from '@/components/dashboard/recent-list-card';
import { UsageChart } from '@/components/dashboard/usage-chart';
import { useAuth } from '@/lib/auth-context';
import { useWallet } from '@/lib/api/credits';
import { useAtsReports } from '@/lib/api/ats';
import { useOptimizations } from '@/lib/api/resume-optimization';
import { useCoverLetters } from '@/lib/api/cover-letters';
import { useInterviews } from '@/lib/api/interview';
import { useMasterResume } from '@/lib/api/master-resume';
import { formatRelativeTime } from '@/lib/format';

const QUICK_ACTIONS = [
  { label: 'Importar CV', href: '/dashboard/import-cv', icon: UploadCloud },
  { label: 'Nova Vaga Alvo', href: '/dashboard/job-targets', icon: Target },
  { label: 'Executar ATS', href: '/dashboard/ats-reports', icon: ScanSearch },
  { label: 'Otimizar Currículo', href: '/dashboard/optimizations', icon: Sparkles },
  { label: 'Praticar Entrevista', href: '/dashboard/interviews', icon: MessagesSquare },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const wallet = useWallet();
  const atsReports = useAtsReports();
  const optimizations = useOptimizations();
  const coverLetters = useCoverLetters();
  const interviews = useInterviews();
  const masterResume = useMasterResume();

  const atsItems: RecentListItem[] | undefined = atsReports.data?.map((r) => ({
    id: r.id,
    title: `Pontuação ${r.overallScore}/100`,
    subtitle: formatRelativeTime(r.createdAt),
    href: `/dashboard/ats-reports/${r.id}`,
  }));
  const optimizationItems: RecentListItem[] | undefined = optimizations.data?.map((o) => ({
    id: o.id,
    title: o.summary ?? `Otimização ${o.status}`,
    subtitle: formatRelativeTime(o.createdAt),
    href: `/dashboard/optimizations/${o.id}`,
  }));
  const coverLetterItems: RecentListItem[] | undefined = coverLetters.data?.map((c) => ({
    id: c.id,
    title: c.title,
    subtitle: formatRelativeTime(c.createdAt),
    href: `/dashboard/cover-letters/${c.id}`,
  }));
  const interviewItems: RecentListItem[] | undefined = interviews.data?.map((i) => ({
    id: i.id,
    title: `${i.type} · ${i.difficulty}`,
    subtitle: formatRelativeTime(i.createdAt),
    href: `/dashboard/interviews/${i.id}`,
  }));

  return (
    <div>
      <PageHeader
        title={`Olá, ${user?.email.split('@')[0] ?? ''}`}
        description="Aqui está um resumo da sua atividade recente."
        actions={
          <Button asChild>
            <Link href="/dashboard/job-targets">
              <Plus className="h-4 w-4" />
              Nova candidatura
            </Link>
          </Button>
        }
      />

      {!masterResume.isLoading && !masterResume.data && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col items-center justify-between gap-4 py-6 text-center sm:flex-row sm:text-left">
            <div>
              <p className="font-semibold">Ainda não tem um Currículo Principal</p>
              <p className="text-sm text-muted-foreground">
                Importe o seu CV existente e preenchemos tudo automaticamente — ou comece do zero.
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button asChild>
                <Link href="/dashboard/import-cv">
                  <UploadCloud className="h-4 w-4" />
                  Importar CV
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/dashboard/resume">Preencher manualmente</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Créditos disponíveis"
          value={wallet.data?.availableCredits ?? 0}
          icon={Wallet}
          loading={wallet.isLoading}
          tone="primary"
        />
        <StatCard
          label="Relatórios ATS"
          value={atsReports.data?.length ?? 0}
          icon={ScanSearch}
          loading={atsReports.isLoading}
        />
        <StatCard
          label="Otimizações"
          value={optimizations.data?.length ?? 0}
          icon={Sparkles}
          loading={optimizations.isLoading}
        />
        <StatCard
          label="Cartas de Apresentação"
          value={coverLetters.data?.length ?? 0}
          icon={Mail}
          loading={coverLetters.isLoading}
        />
        <StatCard
          label="Entrevistas"
          value={interviews.data?.length ?? 0}
          icon={MessagesSquare}
          loading={interviews.isLoading}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UsageChart />
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {QUICK_ACTIONS.map((action) => (
              <Button
                key={action.href}
                variant="outline"
                className="h-auto flex-col gap-2 py-4"
                asChild
              >
                <Link href={action.href}>
                  <action.icon className="h-5 w-5" aria-hidden="true" />
                  <span className="text-xs font-medium leading-tight">{action.label}</span>
                </Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <RecentListCard
          title="ATS Recentes"
          icon={ScanSearch}
          items={atsItems}
          isLoading={atsReports.isLoading}
          viewAllHref="/dashboard/ats-reports"
          emptyLabel="Ainda não executou nenhuma análise ATS."
        />
        <RecentListCard
          title="Otimizações Recentes"
          icon={Sparkles}
          items={optimizationItems}
          isLoading={optimizations.isLoading}
          viewAllHref="/dashboard/optimizations"
          emptyLabel="Ainda não executou nenhuma otimização."
        />
        <RecentListCard
          title="Cartas Recentes"
          icon={Mail}
          items={coverLetterItems}
          isLoading={coverLetters.isLoading}
          viewAllHref="/dashboard/cover-letters"
          emptyLabel="Ainda não gerou nenhuma carta de apresentação."
        />
        <RecentListCard
          title="Entrevistas Recentes"
          icon={MessagesSquare}
          items={interviewItems}
          isLoading={interviews.isLoading}
          viewAllHref="/dashboard/interviews"
          emptyLabel="Ainda não praticou nenhuma entrevista."
        />
      </div>

      <div className="mt-6 flex justify-end">
        <Button variant="link" asChild>
          <Link href="/dashboard/history">
            Ver histórico completo de atividade
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
