'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { MessagesSquare, Plus, Trash2, FileText, Briefcase, UserSquare2 } from 'lucide-react';
import { InterviewDifficulty, InterviewMode, InterviewType } from '@cvlab/types';
import { PageHeader } from '@/components/page-header';
import { EmptyState } from '@/components/empty-state';
import { ErrorState } from '@/components/error-state';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { StatusBadge } from '@/components/status-badge';
import { ScoreBadge } from '@/components/score-badge';
import { ResumeVariantSelect } from '@/components/resume-variant-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
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
import { useInterviews, useStartInterview, useDeleteInterview } from '@/lib/api/interview';
import { useJobTargets } from '@/lib/api/job-targets';
import { ApiError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { formatRelativeTime, humanizeEnum } from '@/lib/format';

/**
 * FASE 11 — shape-level validation only (matches StartInterviewDto exactly:
 * every mode-specific field is optional here too). The actual "which
 * combination is required for this mode" rule lives in ONE place —
 * InterviewService.start() — and is merely mirrored here via superRefine for
 * immediate UX feedback; the API is always the final authority, never
 * duplicated with different logic.
 */
const startSchema = z
  .object({
    mode: z.nativeEnum(InterviewMode),
    resumeVariantId: z.string().optional(),
    jobTargetId: z.string().optional(),
    jobDescription: z.string().max(8000, 'Máximo de 8000 caracteres.').optional(),
    role: z.string().max(200).optional(),
    industry: z.string().max(200).optional(),
    yearsExperience: z.coerce.number().int().min(0).max(60).optional(),
    companyName: z.string().max(200).optional(),
    type: z.nativeEnum(InterviewType),
    difficulty: z.nativeEnum(InterviewDifficulty),
    language: z.string().trim().min(1, 'Indique o idioma.'),
  })
  .superRefine((data, ctx) => {
    if (data.mode === InterviewMode.RESUME && !data.resumeVariantId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resumeVariantId'],
        message: 'Selecione uma versão de currículo.',
      });
    }
    if (data.mode === InterviewMode.JOB && !data.jobTargetId && !data.jobDescription?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['jobDescription'],
        message: 'Indique uma vaga existente ou cole a descrição da vaga.',
      });
    }
    if (data.mode === InterviewMode.ROLE && !data.role?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['role'],
        message: 'Indique o cargo que pretende praticar.',
      });
    }
  });
type StartInput = z.infer<typeof startSchema>;

const MODE_OPTIONS: {
  mode: InterviewMode;
  icon: typeof FileText;
  title: string;
  description: string;
}[] = [
  {
    mode: InterviewMode.RESUME,
    icon: FileText,
    title: 'Praticar com o meu CV',
    description: 'Usa o seu currículo e uma vaga alvo.',
  },
  {
    mode: InterviewMode.JOB,
    icon: Briefcase,
    title: 'Praticar para uma vaga',
    description: 'Não precisa de currículo — indique a vaga.',
  },
  {
    mode: InterviewMode.ROLE,
    icon: UserSquare2,
    title: 'Praticar por cargo',
    description: 'Sem CV nem vaga — apenas o cargo.',
  },
];

export default function InterviewsPage() {
  const { data: interviews, isLoading, isError, refetch } = useInterviews();
  const { data: jobTargets } = useJobTargets();
  const startInterview = useStartInterview();
  const deleteInterview = useDeleteInterview();

  const [startOpen, setStartOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StartInput>({
    resolver: zodResolver(startSchema),
    defaultValues: {
      mode: InterviewMode.RESUME,
      type: InterviewType.MIXED,
      difficulty: InterviewDifficulty.MID,
      language: 'pt-MZ',
    },
  });

  const mode = watch('mode');

  function selectMode(next: InterviewMode) {
    // Fields from the previous mode are never sent for a different mode
    // (the API rejects that combination) — clear them on every mode switch.
    reset({
      mode: next,
      type: watch('type'),
      difficulty: watch('difficulty'),
      language: watch('language'),
    });
  }

  async function onStart(values: StartInput) {
    try {
      const payload =
        values.mode === InterviewMode.RESUME
          ? {
              mode: values.mode,
              resumeVariantId: values.resumeVariantId,
              type: values.type,
              difficulty: values.difficulty,
              language: values.language,
            }
          : values.mode === InterviewMode.JOB
            ? {
                mode: values.mode,
                jobTargetId: values.jobTargetId || undefined,
                jobDescription: values.jobDescription?.trim() || undefined,
                resumeVariantId: values.resumeVariantId || undefined,
                type: values.type,
                difficulty: values.difficulty,
                language: values.language,
              }
            : {
                mode: values.mode,
                role: values.role?.trim(),
                industry: values.industry?.trim() || undefined,
                yearsExperience: values.yearsExperience,
                companyName: values.companyName?.trim() || undefined,
                type: values.type,
                difficulty: values.difficulty,
                language: values.language,
              };

      const session = await startInterview.mutateAsync(payload);
      toast.success('Sessão de entrevista criada.');
      setStartOpen(false);
      window.location.assign(`/dashboard/interviews/${session.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível iniciar a entrevista.');
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    try {
      await deleteInterview.mutateAsync(deletingId);
      toast.success('Sessão removida.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível remover.');
    }
  }

  return (
    <div>
      <PageHeader
        title="Prática de Entrevista"
        description="Treine com perguntas geradas por IA e receba feedback sobre as suas respostas."
        actions={
          <Button onClick={() => setStartOpen(true)}>
            <Plus className="h-4 w-4" />
            Nova entrevista
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : !interviews || interviews.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Nenhuma sessão de entrevista"
          description="Inicie a sua primeira sessão de prática de entrevista."
          action={<Button onClick={() => setStartOpen(true)}>Nova entrevista</Button>}
        />
      ) : (
        <div className="space-y-3">
          {interviews.map((session) => (
            <Card key={session.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <ScoreBadge score={session.overallScore} />
                <Link href={`/dashboard/interviews/${session.id}`} className="min-w-0 flex-1">
                  <p className="font-medium hover:underline">
                    {humanizeEnum(session.type)} · {humanizeEnum(session.difficulty)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {session.questions.length} perguntas · {formatRelativeTime(session.createdAt)}
                  </p>
                </Link>
                <StatusBadge status={session.status} />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar"
                  onClick={() => setDeletingId(session.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova sessão de entrevista</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onStart)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <div
                className="grid gap-2 sm:grid-cols-3"
                role="radiogroup"
                aria-label="Modo da entrevista"
              >
                {MODE_OPTIONS.map(({ mode: optionMode, icon: Icon, title, description }) => (
                  <button
                    key={optionMode}
                    type="button"
                    role="radio"
                    aria-checked={mode === optionMode}
                    onClick={() => selectMode(optionMode)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border p-3 text-left text-sm transition-colors',
                      mode === optionMode
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{title}</span>
                    <span className="text-xs text-muted-foreground">{description}</span>
                  </button>
                ))}
              </div>
            </div>

            {mode === InterviewMode.RESUME && (
              <div className="space-y-1.5">
                <Label>Versão de currículo</Label>
                <ResumeVariantSelect
                  value={watch('resumeVariantId') ?? ''}
                  onChange={(value) => setValue('resumeVariantId', value)}
                />
                <p className="text-xs text-muted-foreground">
                  Para entrevistas baseadas no seu CV, selecione uma vaga associada.
                </p>
                {errors.resumeVariantId && (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.resumeVariantId.message}
                  </p>
                )}
              </div>
            )}

            {mode === InterviewMode.JOB && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="jobTargetId">Vaga existente (opcional)</Label>
                  <Select
                    value={watch('jobTargetId') ?? ''}
                    onValueChange={(value) => setValue('jobTargetId', value)}
                  >
                    <SelectTrigger id="jobTargetId">
                      <SelectValue placeholder="Selecione uma vaga" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTargets?.length === 0 && (
                        <p className="p-2 text-xs text-muted-foreground">Nenhuma vaga guardada.</p>
                      )}
                      {jobTargets?.map((jt) => (
                        <SelectItem key={jt.id} value={jt.id}>
                          {jt.title}
                          {jt.company ? ` · ${jt.company}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="jobDescription">Ou cole a descrição da vaga</Label>
                  <Textarea
                    id="jobDescription"
                    rows={4}
                    value={watch('jobDescription') ?? ''}
                    onChange={(e) => setValue('jobDescription', e.target.value)}
                    placeholder="Cole aqui o texto da vaga…"
                  />
                  <p className="text-xs text-muted-foreground">
                    Para este modo, indique uma vaga existente ou cole a descrição da vaga.
                  </p>
                  {errors.jobDescription && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.jobDescription.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Versão de currículo (opcional)</Label>
                  <ResumeVariantSelect
                    requireJobTarget={false}
                    value={watch('resumeVariantId') ?? ''}
                    onChange={(value) => setValue('resumeVariantId', value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    O CV não é obrigatório neste modo — pode adicioná-lo como contexto extra.
                  </p>
                </div>
              </div>
            )}

            {mode === InterviewMode.ROLE && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="role">Cargo</Label>
                  <Input
                    id="role"
                    value={watch('role') ?? ''}
                    onChange={(e) => setValue('role', e.target.value)}
                    placeholder="Ex.: Engenheiro de Backend"
                  />
                  {errors.role && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.role.message}
                    </p>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="industry">Indústria (opcional)</Label>
                    <Input
                      id="industry"
                      value={watch('industry') ?? ''}
                      onChange={(e) => setValue('industry', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="yearsExperience">Anos de experiência (opcional)</Label>
                    <Input
                      id="yearsExperience"
                      type="number"
                      min={0}
                      max={60}
                      value={watch('yearsExperience') ?? ''}
                      onChange={(e) =>
                        setValue(
                          'yearsExperience',
                          e.target.value === '' ? undefined : Number(e.target.value),
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companyName">Empresa (opcional)</Label>
                  <Input
                    id="companyName"
                    value={watch('companyName') ?? ''}
                    onChange={(e) => setValue('companyName', e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="type">Tipo</Label>
                <Select
                  value={watch('type')}
                  onValueChange={(value) => setValue('type', value as InterviewType)}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(InterviewType).map((type) => (
                      <SelectItem key={type} value={type}>
                        {humanizeEnum(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="difficulty">Dificuldade</Label>
                <Select
                  value={watch('difficulty')}
                  onValueChange={(value) => setValue('difficulty', value as InterviewDifficulty)}
                >
                  <SelectTrigger id="difficulty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(InterviewDifficulty).map((difficulty) => (
                      <SelectItem key={difficulty} value={difficulty}>
                        {humanizeEnum(difficulty)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="language">Idioma</Label>
              <Input
                id="language"
                value={watch('language') ?? ''}
                onChange={(e) => setValue('language', e.target.value)}
              />
              {errors.language && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.language.message}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setStartOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Iniciar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Eliminar esta sessão?"
        description="Esta ação não pode ser desfeita."
        destructive
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  );
}
