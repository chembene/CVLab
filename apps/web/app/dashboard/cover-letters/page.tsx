'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Mail,
  MoreHorizontal,
  Plus,
  Copy,
  RotateCcw,
  Archive,
  Trash2,
  RefreshCcw,
} from 'lucide-react';
import { CoverLetterTone } from '@cvlab/types';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { ResumeVariantSelect } from '@/components/resume-variant-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  useCoverLetters,
  useGenerateCoverLetter,
  useDuplicateCoverLetter,
  useArchiveCoverLetter,
  useRestoreCoverLetter,
  useRegenerateCoverLetter,
  useDeleteCoverLetter,
} from '@/lib/api/cover-letters';
import { ApiError } from '@/lib/api-client';
import { formatRelativeTime, humanizeEnum } from '@/lib/format';

const generateSchema = z.object({
  resumeVariantId: z.string().min(1, 'Selecione uma versão de currículo.'),
  tone: z.nativeEnum(CoverLetterTone),
  language: z.string().trim().min(1, 'Indique o idioma.'),
});
type GenerateInput = z.infer<typeof generateSchema>;

export default function CoverLettersPage() {
  const { data: coverLetters, isLoading, isError, refetch } = useCoverLetters();
  const generateCoverLetter = useGenerateCoverLetter();
  const duplicateCoverLetter = useDuplicateCoverLetter();
  const archiveCoverLetter = useArchiveCoverLetter();
  const restoreCoverLetter = useRestoreCoverLetter();
  const regenerateCoverLetter = useRegenerateCoverLetter();
  const deleteCoverLetter = useDeleteCoverLetter();

  const [generateOpen, setGenerateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GenerateInput>({
    resolver: zodResolver(generateSchema),
    defaultValues: { tone: CoverLetterTone.PROFESSIONAL, language: 'pt-MZ' },
  });

  async function onGenerate(values: GenerateInput) {
    try {
      const letter = await generateCoverLetter.mutateAsync(values);
      toast.success('Carta de apresentação gerada.');
      setGenerateOpen(false);
      window.location.assign(`/dashboard/cover-letters/${letter.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível gerar a carta.');
    }
  }

  async function handleAction(
    action: 'duplicate' | 'archive' | 'restore' | 'regenerate',
    id: string,
  ) {
    try {
      if (action === 'duplicate') {
        await duplicateCoverLetter.mutateAsync(id);
        toast.success('Carta duplicada.');
      } else if (action === 'archive') {
        await archiveCoverLetter.mutateAsync(id);
        toast.success('Carta arquivada.');
      } else if (action === 'restore') {
        await restoreCoverLetter.mutateAsync(id);
        toast.success('Carta restaurada.');
      } else {
        const letter = await regenerateCoverLetter.mutateAsync(id);
        toast.success('Nova versão gerada.');
        window.location.assign(`/dashboard/cover-letters/${letter.id}`);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível concluir a ação.');
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await deleteCoverLetter.mutateAsync(deletingId);
      toast.success('Carta removida.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Cartas de Apresentação"
        description="Gere cartas de apresentação personalizadas com IA para cada candidatura."
        actions={
          <Button onClick={() => setGenerateOpen(true)}>
            <Plus className="h-4 w-4" />
            Gerar carta
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !coverLetters || coverLetters.length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nenhuma carta de apresentação"
          description="Gere a sua primeira carta de apresentação personalizada com IA."
          action={<Button onClick={() => setGenerateOpen(true)}>Gerar carta</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {coverLetters.map((letter) => (
            <Card
              key={letter.id}
              className={letter.status === 'ARCHIVED' ? 'opacity-60' : undefined}
            >
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/dashboard/cover-letters/${letter.id}`}
                    className="min-w-0 font-medium hover:underline"
                  >
                    <span className="line-clamp-2">{letter.title}</span>
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
                      <DropdownMenuItem onSelect={() => handleAction('regenerate', letter.id)}>
                        <RefreshCcw className="h-4 w-4" />
                        Regerar
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleAction('duplicate', letter.id)}>
                        <Copy className="h-4 w-4" />
                        Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          handleAction(
                            letter.status === 'ARCHIVED' ? 'restore' : 'archive',
                            letter.id,
                          )
                        }
                      >
                        {letter.status === 'ARCHIVED' ? (
                          <RotateCcw className="h-4 w-4" />
                        ) : (
                          <Archive className="h-4 w-4" />
                        )}
                        {letter.status === 'ARCHIVED' ? 'Restaurar' : 'Arquivar'}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDeletingId(letter.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <StatusBadge status={letter.status} />
                  <span className="text-muted-foreground">{humanizeEnum(letter.tone)}</span>
                  <span className="text-muted-foreground">v{letter.version}</span>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{letter.content}</p>
                <p className="text-xs text-muted-foreground">
                  Atualizado {formatRelativeTime(letter.updatedAt)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar carta de apresentação</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onGenerate)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Versão de currículo</Label>
              <ResumeVariantSelect
                value={watch('resumeVariantId') ?? ''}
                onChange={(value) => setValue('resumeVariantId', value)}
              />
              {errors.resumeVariantId && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.resumeVariantId.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tone">Tom</Label>
              <Select
                value={watch('tone')}
                onValueChange={(value) => setValue('tone', value as CoverLetterTone)}
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
              <Input
                id="language"
                placeholder="pt-MZ"
                value={watch('language') ?? ''}
                onChange={(e) => setValue('language', e.target.value, { shouldValidate: true })}
              />
              {errors.language && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.language.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGenerateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Gerar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Eliminar esta carta?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
