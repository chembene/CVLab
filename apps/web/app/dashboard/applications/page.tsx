'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ApplicationStatus } from '@cvlab/types';
import { Briefcase, Building2, Search } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { StatusBadge } from '@/components/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useApplications, useUpdateApplication, type Application } from '@/lib/api/applications';
import { useJobTargets } from '@/lib/api/job-targets';
import { useResumeVariants } from '@/lib/api/resume-variants';
import { ApiError } from '@/lib/api-client';
import { formatDate, formatRelativeTime, humanizeEnum } from '@/lib/format';

type SortOrder = 'newest' | 'oldest';
type StatusFilter = 'ALL' | ApplicationStatus;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: ApplicationStatus.SAVED, label: 'Guardadas' },
  { value: ApplicationStatus.APPLIED, label: 'Candidatadas' },
  { value: ApplicationStatus.INTERVIEW, label: 'Entrevista' },
  { value: ApplicationStatus.OFFER, label: 'Ofertas' },
  { value: ApplicationStatus.REJECTED, label: 'Rejeitadas' },
  { value: ApplicationStatus.WITHDRAWN, label: 'Retiradas' },
  { value: ApplicationStatus.ARCHIVED, label: 'Arquivadas' },
];

/** One quick-status-change control, reused by both the card grid and (soon) the detail page — never re-implements the update itself, always goes through useUpdateApplication(). */
function ApplicationStatusSelect({ application }: { application: Application }) {
  const updateApplication = useUpdateApplication(application.id);

  async function handleChange(status: string) {
    try {
      await updateApplication.mutateAsync({ status: status as ApplicationStatus });
      toast.success('Estado atualizado.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar o estado.');
    }
  }

  return (
    <Select value={application.status} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-40 text-xs" onClick={(e) => e.preventDefault()}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.values(ApplicationStatus).map((status) => (
          <SelectItem key={status} value={status}>
            {humanizeEnum(status)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default function ApplicationsPage() {
  const { data: applications, isLoading, isError, refetch } = useApplications();
  const { data: jobTargets } = useJobTargets();
  const { data: resumeVariants } = useResumeVariants();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');

  const jobTargetById = useMemo(
    () => new Map((jobTargets ?? []).map((jt) => [jt.id, jt])),
    [jobTargets],
  );
  const resumeVariantById = useMemo(
    () => new Map((resumeVariants ?? []).map((rv) => [rv.id, rv])),
    [resumeVariants],
  );

  const metrics = useMemo(() => {
    const list = applications ?? [];
    return {
      total: list.length,
      saved: list.filter((a) => a.status === ApplicationStatus.SAVED).length,
      applied: list.filter((a) => a.status === ApplicationStatus.APPLIED).length,
      interview: list.filter((a) => a.status === ApplicationStatus.INTERVIEW).length,
      offer: list.filter((a) => a.status === ApplicationStatus.OFFER).length,
    };
  }, [applications]);

  const visibleApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (applications ?? [])
      .filter((a) => statusFilter === 'ALL' || a.status === statusFilter)
      .filter((a) => {
        if (!query) return true;
        const jobTarget = jobTargetById.get(a.jobTargetId);
        return (
          jobTarget?.title.toLowerCase().includes(query) ||
          jobTarget?.company?.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        return sortOrder === 'newest' ? -diff : diff;
      });
  }, [applications, statusFilter, search, sortOrder, jobTargetById]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Candidaturas"
        description="Acompanhe todas as candidaturas que preparou, desde a vaga até ao resultado."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold">{metrics.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Guardadas</p>
            <p className="text-2xl font-semibold">{metrics.saved}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Candidatadas</p>
            <p className="text-2xl font-semibold">{metrics.applied}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Em entrevista</p>
            <p className="text-2xl font-semibold">{metrics.interview}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Ofertas</p>
            <p className="text-2xl font-semibold">{metrics.offer}</p>
          </CardContent>
        </Card>
      </div>

      {!applications || applications.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="Ainda sem candidaturas"
          description="Prepare uma candidatura a partir de uma Vaga Alvo para a ver aqui."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <TabsList className="flex-wrap">
                {STATUS_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar por vaga ou empresa..."
                  className="w-64 pl-8"
                  aria-label="Pesquisar candidaturas"
                />
              </div>
              <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as SortOrder)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Mais recentes</SelectItem>
                  <SelectItem value="oldest">Mais antigas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {visibleApplications.length === 0 ? (
            <EmptyState
              icon={Search}
              title="Nenhuma candidatura encontrada"
              description="Tente outra pesquisa ou estado."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleApplications.map((application) => {
                const jobTarget = jobTargetById.get(application.jobTargetId);
                const resumeVariant = application.resumeVariantId
                  ? resumeVariantById.get(application.resumeVariantId)
                  : undefined;

                return (
                  <Link key={application.id} href={`/dashboard/applications/${application.id}`}>
                    <Card className="h-full transition-shadow hover:shadow-elevation-2">
                      <CardContent className="space-y-3 p-5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 font-medium">
                            {jobTarget?.title ?? 'Vaga removida'}
                          </p>
                          <StatusBadge status={application.status} className="shrink-0" />
                        </div>
                        {jobTarget?.company && (
                          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Building2 className="h-3.5 w-3.5" />
                            {jobTarget.company}
                            {jobTarget.location && ` · ${jobTarget.location}`}
                          </p>
                        )}
                        {resumeVariant && (
                          <p className="text-xs text-muted-foreground">
                            Currículo: {resumeVariant.title}
                          </p>
                        )}
                        {application.appliedAt && (
                          <p className="text-xs text-muted-foreground">
                            Candidatura em {formatDate(application.appliedAt)}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Atualizada {formatRelativeTime(application.updatedAt)}
                        </p>
                        <div onClick={(e) => e.preventDefault()}>
                          <ApplicationStatusSelect application={application} />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
