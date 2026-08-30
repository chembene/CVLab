'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ApplicationStatus } from '@cvlab/types';
import { Building2, SearchX, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  useApplications,
  useUpdateApplication,
  useDeleteApplication,
} from '@/lib/api/applications';
import { useJobTargets } from '@/lib/api/job-targets';
import { useResumeVariants } from '@/lib/api/resume-variants';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, humanizeEnum } from '@/lib/format';

/** yyyy-MM-dd, what <input type="date"> needs — the API gives back a full ISO datetime. */
function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  return value.slice(0, 10);
}

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // No GET /applications/:id on the backend (deliberate, since Phase 2B —
  // see docs/architecture/application-pipeline.md §"Known gaps"). The
  // approved decision for this phase is to derive the single Application
  // from this same list query's cache rather than add one.
  const { data: applications, isLoading, isError, refetch } = useApplications();
  const { data: jobTargets } = useJobTargets();
  const { data: resumeVariants } = useResumeVariants();
  const updateApplication = useUpdateApplication(id);
  const deleteApplication = useDeleteApplication();

  const application = applications?.find((a) => a.id === id);
  const jobTarget = application
    ? jobTargets?.find((jt) => jt.id === application.jobTargetId)
    : undefined;
  const resumeVariant = application?.resumeVariantId
    ? resumeVariants?.find((rv) => rv.id === application.resumeVariantId)
    : undefined;

  const [status, setStatus] = useState<ApplicationStatus>(ApplicationStatus.SAVED);
  const [appliedAt, setAppliedAt] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Seeds the editable form once the Application is found — react-query's
  // cache can resolve after the first render (fresh page load / deep link).
  useEffect(() => {
    if (!application) return;
    setStatus(application.status);
    setAppliedAt(toDateInputValue(application.appliedAt));
    setInterviewDate(toDateInputValue(application.interviewDate));
    setResult(application.result ?? '');
    setNotes(application.notes ?? '');
  }, [application]);

  async function handleSave() {
    try {
      await updateApplication.mutateAsync({
        status,
        appliedAt: appliedAt || undefined,
        interviewDate: interviewDate || undefined,
        result: result || undefined,
        notes: notes || undefined,
      });
      toast.success('Candidatura atualizada.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível guardar as alterações.',
      );
    }
  }

  async function handleDelete() {
    try {
      await deleteApplication.mutateAsync(id);
      toast.success('Candidatura eliminada.');
      router.push('/dashboard/applications');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível eliminar a candidatura.',
      );
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (isError) {
    return <ErrorState onRetry={() => refetch()} />;
  }
  if (!application) {
    return (
      <EmptyState
        icon={SearchX}
        title="Candidatura não encontrada"
        description="Esta candidatura não existe ou foi eliminada."
        action={
          <Button asChild>
            <Link href="/dashboard/applications">Voltar às candidaturas</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={jobTarget?.title ?? 'Vaga removida'}
        breadcrumbs={[
          { label: 'Candidaturas', href: '/dashboard/applications' },
          { label: jobTarget?.title ?? 'Candidatura' },
        ]}
        actions={
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="h-4 w-4" />
            Eliminar
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Detalhes da candidatura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as ApplicationStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(ApplicationStatus).map((s) => (
                      <SelectItem key={s} value={s}>
                        {humanizeEnum(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appliedAt">Data da candidatura</Label>
                <Input
                  id="appliedAt"
                  type="date"
                  value={appliedAt}
                  onChange={(e) => setAppliedAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="interviewDate">Data da entrevista</Label>
                <Input
                  id="interviewDate"
                  type="date"
                  value={interviewDate}
                  onChange={(e) => setInterviewDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="result">Resultado</Label>
                <Input
                  id="result"
                  value={result}
                  onChange={(e) => setResult(e.target.value)}
                  placeholder="Ex.: À espera de resposta"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSave} loading={updateApplication.isPending}>
                Guardar alterações
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vaga</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {jobTarget ? (
                <>
                  <StatusBadge status={jobTarget.status} />
                  {jobTarget.company && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building2 className="h-3.5 w-3.5" />
                      {jobTarget.company}
                      {jobTarget.location && ` · ${jobTarget.location}`}
                    </p>
                  )}
                  <Link
                    href={`/dashboard/job-targets/${jobTarget.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Ver vaga alvo
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Esta vaga alvo foi removida.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Currículo utilizado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {resumeVariant ? (
                <>
                  <p className="text-sm font-medium">{resumeVariant.title}</p>
                  {application.resumeVariantVersionId && (
                    <p className="text-xs text-muted-foreground">
                      A versão exata usada nesta candidatura foi guardada permanentemente no momento
                      da candidatura.
                    </p>
                  )}
                  <Link
                    href={`/dashboard/resume-variants/${resumeVariant.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    Ver versão de currículo
                  </Link>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nenhuma versão de currículo associada.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Datas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm text-muted-foreground">
              <p>Criada: {formatDateTime(application.createdAt)}</p>
              <p>Atualizada: {formatDateTime(application.updatedAt)}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar esta candidatura?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
