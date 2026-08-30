'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Copy, Rocket, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ResumeVariantSelect } from '@/components/resume-variant-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { JobTargetForm } from '@/components/job-targets/job-target-form';
import { useJobTarget, useUpdateJobTarget, useDeleteJobTarget } from '@/lib/api/job-targets';
import { useCreateResumeVariant } from '@/lib/api/resume-variants';
import { useStartPipeline } from '@/lib/api/application-pipeline';
import { jobTargetFormToPayload, type JobTargetFormInput } from '@/lib/validation/job-target';
import { ApiError } from '@/lib/api-client';

export default function JobTargetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: jobTarget, isLoading, isError, refetch } = useJobTarget(id);
  const updateJobTarget = useUpdateJobTarget(id);
  const deleteJobTarget = useDeleteJobTarget();
  const createResumeVariant = useCreateResumeVariant();
  const startPipeline = useStartPipeline();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [prepareOpen, setPrepareOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState('');

  async function handleUpdate(values: JobTargetFormInput) {
    try {
      await updateJobTarget.mutateAsync(jobTargetFormToPayload(values));
      toast.success('Vaga atualizada.');
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'Não foi possível guardar as alterações.',
      );
    }
  }

  async function handleDelete() {
    try {
      await deleteJobTarget.mutateAsync(id);
      toast.success('Vaga removida.');
      router.push('/dashboard/job-targets');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover a vaga.');
    }
  }

  async function handleCreateVariant() {
    if (!jobTarget) return;
    try {
      const variant = await createResumeVariant.mutateAsync({
        title: `Currículo para ${jobTarget.title}`,
        jobTargetId: jobTarget.id,
      });
      toast.success('Versão de currículo criada.');
      router.push(`/dashboard/resume-variants/${variant.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível criar a versão. Crie primeiro o seu currículo principal.',
      );
    }
  }

  async function handlePreparePipeline() {
    if (!jobTarget || !selectedVariantId) return;
    try {
      const session = await startPipeline.mutateAsync({
        resumeVariantId: selectedVariantId,
        jobTargetId: jobTarget.id,
      });
      setPrepareOpen(false);
      router.push(`/dashboard/application-pipeline/${session.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'Não foi possível iniciar a preparação da candidatura.',
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

  if (isError || !jobTarget) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={jobTarget.title}
        breadcrumbs={[
          { label: 'Vagas Alvo', href: '/dashboard/job-targets' },
          { label: jobTarget.title },
        ]}
        actions={
          <>
            <Button onClick={() => setPrepareOpen(true)}>
              <Rocket className="h-4 w-4" />
              Preparar candidatura
            </Button>
            <Button
              variant="outline"
              onClick={handleCreateVariant}
              loading={createResumeVariant.isPending}
            >
              <Copy className="h-4 w-4" />
              Criar versão de currículo
            </Button>
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Detalhes da vaga</CardTitle>
          </CardHeader>
          <CardContent>
            <JobTargetForm
              jobTarget={jobTarget}
              submitLabel="Guardar alterações"
              onSubmit={handleUpdate}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Palavras-chave</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {jobTarget.keywords.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma</p>
              )}
              {jobTarget.keywords.map((k) => (
                <Badge key={k.id} variant="secondary">
                  {k.keyword}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Competências</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {jobTarget.skills.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma</p>
              )}
              {jobTarget.skills.map((s) => (
                <Badge key={s.id} variant={s.required ? 'default' : 'secondary'}>
                  {s.skill}
                  {s.required && ' *'}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Idiomas</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {jobTarget.languages.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum</p>
              )}
              {jobTarget.languages.map((l) => (
                <Badge key={l.id} variant="secondary">
                  {l.language}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={prepareOpen} onOpenChange={setPrepareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Preparar candidatura</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <ResumeVariantSelect
              value={selectedVariantId}
              onChange={setSelectedVariantId}
              requireJobTarget={false}
            />
            <p className="text-xs text-muted-foreground">
              Vamos associar esta versão do currículo a esta vaga (se ainda não estiver) e guiá-lo
              pelos passos: análise ATS, melhoria do currículo, carta de apresentação, prática de
              entrevista, exportação e registo da candidatura. Pode saltar qualquer passo.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPrepareOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handlePreparePipeline}
              loading={startPipeline.isPending}
              disabled={!selectedVariantId}
            >
              Continuar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar esta vaga alvo?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
