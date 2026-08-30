'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Copy, MoreHorizontal, Plus, RotateCcw, Trash2, Archive } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  useResumeVariants,
  useCreateResumeVariant,
  useDuplicateResumeVariant,
  useArchiveResumeVariant,
  useRestoreResumeVariant,
  useDeleteResumeVariant,
} from '@/lib/api/resume-variants';
import { useJobTargets } from '@/lib/api/job-targets';
import { ApiError } from '@/lib/api-client';
import { formatRelativeTime } from '@/lib/format';

const createSchema = z.object({
  title: z.string().trim().min(1, 'O título é obrigatório.').max(200),
  jobTargetId: z.string().optional(),
});
type CreateInput = z.infer<typeof createSchema>;

export default function ResumeVariantsPage() {
  const { data: variants, isLoading, isError, refetch } = useResumeVariants();
  const { data: jobTargets } = useJobTargets();
  const createVariant = useCreateResumeVariant();
  const duplicateVariant = useDuplicateResumeVariant();
  const archiveVariant = useArchiveResumeVariant();
  const restoreVariant = useRestoreResumeVariant();
  const deleteVariant = useDeleteResumeVariant();

  const [createOpen, setCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateInput>({ resolver: zodResolver(createSchema) });

  async function onCreate(values: CreateInput) {
    try {
      await createVariant.mutateAsync({
        title: values.title,
        jobTargetId: values.jobTargetId || undefined,
      });
      toast.success('Versão de currículo criada.');
      setCreateOpen(false);
      reset();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível criar a versão.');
    }
  }

  async function handleDuplicate(id: string) {
    try {
      await duplicateVariant.mutateAsync({ id });
      toast.success('Versão duplicada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível duplicar.');
    }
  }

  async function handleArchiveToggle(id: string, archived: boolean) {
    try {
      if (archived) {
        await restoreVariant.mutateAsync(id);
        toast.success('Versão restaurada.');
      } else {
        await archiveVariant.mutateAsync(id);
        toast.success('Versão arquivada.');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar.');
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await deleteVariant.mutateAsync(deletingId);
      toast.success('Versão removida.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  function jobTargetTitle(jobTargetId?: string | null): string | null {
    if (!jobTargetId) return null;
    return jobTargets?.find((jt) => jt.id === jobTargetId)?.title ?? null;
  }

  return (
    <div>
      <PageHeader
        title="Versões do Currículo"
        description="Cópias independentes do seu currículo principal, adaptadas a vagas específicas."
        breadcrumbs={[{ label: 'Currículo', href: '/dashboard/resume' }, { label: 'Versões' }]}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova versão
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !variants || variants.length === 0 ? (
        <EmptyState
          icon={Copy}
          title="Nenhuma versão de currículo"
          description="Crie a sua primeira versão adaptada a uma vaga específica."
          action={<Button onClick={() => setCreateOpen(true)}>Nova versão</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {variants.map((variant) => (
            <Card key={variant.id} className={variant.archived ? 'opacity-60' : undefined}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/dashboard/resume-variants/${variant.id}`}
                    className="min-w-0 font-medium hover:underline"
                  >
                    <span className="line-clamp-2">{variant.title}</span>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        aria-label="Mais ações"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => handleDuplicate(variant.id)}>
                        <Copy className="h-4 w-4" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => handleArchiveToggle(variant.id, variant.archived)}
                      >
                        {variant.archived ? (
                          <RotateCcw className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                        {variant.archived ? 'Restaurar' : 'Arquivar'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDeletingId(variant.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={variant.status} />
                  <span>v{variant.version}</span>
                  {variant.archived && <Badge variant="secondary">Arquivado</Badge>}
                </div>

                {jobTargetTitle(variant.jobTargetId) && (
                  <p className="truncate text-sm text-muted-foreground">
                    Para: {jobTargetTitle(variant.jobTargetId)}
                  </p>
                )}

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Completo</span>
                    <span>{variant.completionPercentage}%</span>
                  </div>
                  <Progress value={variant.completionPercentage} />
                </div>

                <p className="text-xs text-muted-foreground">
                  Atualizado {formatRelativeTime(variant.updatedAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova versão de currículo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onCreate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                placeholder="Ex: Engenheiro Backend Sénior"
                {...register('title')}
              />
              {errors.title && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jobTargetId">Vaga alvo (opcional)</Label>
              <Select
                value={watch('jobTargetId') ?? ''}
                onValueChange={(value) => setValue('jobTargetId', value)}
              >
                <SelectTrigger id="jobTargetId">
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  {jobTargets?.map((jt) => (
                    <SelectItem key={jt.id} value={jt.id}>
                      {jt.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Criar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Eliminar versão de currículo?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
