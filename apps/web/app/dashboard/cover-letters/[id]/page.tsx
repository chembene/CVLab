'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Archive, Copy, Palette, RefreshCcw, RotateCcw, Trash2 } from 'lucide-react';
import { CoverLetterTone } from '@cvlab/types';
import { PageHeader } from '@/components/page-header';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCoverLetter,
  useUpdateCoverLetter,
  useRegenerateCoverLetter,
  useDuplicateCoverLetter,
  useArchiveCoverLetter,
  useRestoreCoverLetter,
  useDeleteCoverLetter,
} from '@/lib/api/cover-letters';
import { ApiError } from '@/lib/api-client';
import { formatDateTime, humanizeEnum } from '@/lib/format';

interface EditForm {
  title: string;
  content: string;
  tone: CoverLetterTone;
  language: string;
}

export default function CoverLetterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: letter, isLoading, isError, refetch } = useCoverLetter(id);
  const updateCoverLetter = useUpdateCoverLetter(id);
  const regenerateCoverLetter = useRegenerateCoverLetter();
  const duplicateCoverLetter = useDuplicateCoverLetter();
  const archiveCoverLetter = useArchiveCoverLetter();
  const restoreCoverLetter = useRestoreCoverLetter();
  const deleteCoverLetter = useDeleteCoverLetter();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { isSubmitting, isDirty },
  } = useForm<EditForm>();

  useEffect(() => {
    if (letter) {
      reset({
        title: letter.title,
        content: letter.content,
        tone: letter.tone,
        language: letter.language,
      });
    }
  }, [letter, reset]);

  async function onSubmit(values: EditForm) {
    try {
      await updateCoverLetter.mutateAsync(values);
      toast.success('Carta guardada.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível guardar.');
    }
  }

  async function handleRegenerate() {
    try {
      const newLetter = await regenerateCoverLetter.mutateAsync(id);
      toast.success('Nova versão gerada.');
      router.push(`/dashboard/cover-letters/${newLetter.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível regerar.');
    }
  }

  async function handleDuplicate() {
    try {
      const copy = await duplicateCoverLetter.mutateAsync(id);
      toast.success('Carta duplicada.');
      router.push(`/dashboard/cover-letters/${copy.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível duplicar.');
    }
  }

  async function handleArchiveToggle() {
    if (!letter) return;
    try {
      if (letter.status === 'ARCHIVED') {
        await restoreCoverLetter.mutateAsync(id);
        toast.success('Carta restaurada.');
      } else {
        await archiveCoverLetter.mutateAsync(id);
        toast.success('Carta arquivada.');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível atualizar.');
    }
  }

  async function handleDelete() {
    try {
      await deleteCoverLetter.mutateAsync(id);
      toast.success('Carta removida.');
      router.push('/dashboard/cover-letters');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.');
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

  if (isError || !letter) {
    return <ErrorState onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={letter.title}
        description={`Versão ${letter.version} · ${formatDateTime(letter.updatedAt)}`}
        breadcrumbs={[
          { label: 'Cartas de Apresentação', href: '/dashboard/cover-letters' },
          { label: letter.title },
        ]}
        actions={
          <>
            <StatusBadge status={letter.status} />
            <Button variant="outline" asChild>
              <Link href={`/dashboard/cover-letters/${letter.id}/template`}>
                <Palette className="h-4 w-4" />
                Modelo e Aparência
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={handleRegenerate}
              loading={regenerateCoverLetter.isPending}
            >
              <RefreshCcw className="h-4 w-4" />
              Regerar
            </Button>
            <Button
              variant="outline"
              onClick={handleDuplicate}
              loading={duplicateCoverLetter.isPending}
            >
              <Copy className="h-4 w-4" />
              Duplicar
            </Button>
            <Button variant="outline" onClick={handleArchiveToggle}>
              {letter.status === 'ARCHIVED' ? (
                <RotateCcw className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              {letter.status === 'ARCHIVED' ? 'Restaurar' : 'Arquivar'}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Editar carta</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título</Label>
              <Input id="title" {...register('title')} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tone">Tom</Label>
                <Select
                  value={watch('tone')}
                  onValueChange={(value) =>
                    setValue('tone', value as CoverLetterTone, { shouldDirty: true })
                  }
                >
                  <SelectTrigger id="tone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(CoverLetterTone).map((tone) => (
                      <SelectItem key={tone} value={tone}>
                        {humanizeEnum(tone)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="language">Idioma</Label>
                <Input id="language" {...register('language')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="content">Conteúdo</Label>
              <Textarea
                id="content"
                rows={16}
                className="font-mono text-sm"
                {...register('content')}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
                Guardar alterações
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar esta carta?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
