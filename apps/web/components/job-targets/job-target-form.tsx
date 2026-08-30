'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { JobTargetStatus } from '@cvlab/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { jobTargetSchema, type JobTargetFormInput } from '@/lib/validation/job-target';
import type { JobTarget } from '@/lib/api/job-targets';

function toDefaults(jobTarget?: JobTarget): Partial<JobTargetFormInput> {
  if (!jobTarget) return { currency: 'MZN', status: JobTargetStatus.DRAFT };
  return {
    title: jobTarget.title,
    company: jobTarget.company ?? '',
    location: jobTarget.location ?? '',
    employmentType: jobTarget.employmentType ?? '',
    seniority: jobTarget.seniority ?? '',
    salaryMin: jobTarget.salaryMin != null ? String(jobTarget.salaryMin) : '',
    salaryMax: jobTarget.salaryMax != null ? String(jobTarget.salaryMax) : '',
    currency: jobTarget.currency,
    jobUrl: jobTarget.jobUrl ?? '',
    jobDescription: jobTarget.jobDescription ?? '',
    status: jobTarget.status,
    notes: jobTarget.notes ?? '',
    keywords: jobTarget.keywords.map((k) => k.keyword).join(', '),
    requiredSkills: jobTarget.skills
      .filter((s) => s.required)
      .map((s) => s.skill)
      .join(', '),
    optionalSkills: jobTarget.skills
      .filter((s) => !s.required)
      .map((s) => s.skill)
      .join(', '),
    languages: jobTarget.languages.map((l) => l.language).join(', '),
  };
}

interface JobTargetFormProps {
  jobTarget?: JobTarget;
  submitLabel: string;
  onSubmit: (values: JobTargetFormInput) => Promise<void>;
  onCancel?: () => void;
}

/** Shared create/edit form for Job Targets — both the list page's "new" dialog and the detail page's edit view render this, avoiding a duplicate field list. */
export function JobTargetForm({ jobTarget, submitLabel, onSubmit, onCancel }: JobTargetFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<JobTargetFormInput>({
    resolver: zodResolver(jobTargetSchema),
    defaultValues: toDefaults(jobTarget),
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="title">Título da vaga</Label>
          <Input id="title" {...register('title')} />
          {errors.title && (
            <p role="alert" className="text-sm text-destructive">
              {errors.title.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company">Empresa</Label>
          <Input id="company" {...register('company')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="location">Local</Label>
          <Input id="location" {...register('location')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="employmentType">Tipo de contrato</Label>
          <Input id="employmentType" {...register('employmentType')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seniority">Senioridade</Label>
          <Input id="seniority" placeholder="Ex: Senior" {...register('seniority')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salaryMin">Salário mínimo</Label>
          <Input id="salaryMin" type="number" {...register('salaryMin')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="salaryMax">Salário máximo</Label>
          <Input id="salaryMax" type="number" {...register('salaryMax')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Estado</Label>
          <Select
            value={watch('status')}
            onValueChange={(value) => setValue('status', value as JobTargetStatus)}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(JobTargetStatus).map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="jobUrl">URL da vaga</Label>
          <Input id="jobUrl" {...register('jobUrl')} />
          {errors.jobUrl && (
            <p role="alert" className="text-sm text-destructive">
              {errors.jobUrl.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="jobDescription">Descrição da vaga</Label>
        <Textarea id="jobDescription" rows={4} {...register('jobDescription')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="keywords">Palavras-chave (separadas por vírgula)</Label>
          <Input id="keywords" {...register('keywords')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="languages">Idiomas (separados por vírgula)</Label>
          <Input id="languages" {...register('languages')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="requiredSkills">Competências obrigatórias (vírgula)</Label>
          <Input id="requiredSkills" {...register('requiredSkills')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="optionalSkills">Competências desejáveis (vírgula)</Label>
          <Input id="optionalSkills" {...register('optionalSkills')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notas</Label>
        <Textarea id="notes" rows={2} {...register('notes')} />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
