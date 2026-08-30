'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useResumeVariants } from '@/lib/api/resume-variants';

interface ResumeVariantSelectProps {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  /** Only variants linked to a job target are selectable by default — ATS/Optimization/Cover Letter/Interview all require one. */
  requireJobTarget?: boolean;
}

/** Shared "pick a resume variant" dropdown — reused by ATS, Resume Optimization, Cover Letter, and Interview "run/generate" dialogs instead of four near-duplicate selects. */
export function ResumeVariantSelect({
  value,
  onChange,
  id,
  requireJobTarget = true,
}: ResumeVariantSelectProps) {
  const { data: variants } = useResumeVariants();
  const options = requireJobTarget ? variants?.filter((v) => v.jobTargetId) : variants;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id}>
        <SelectValue placeholder="Selecione uma versão de currículo" />
      </SelectTrigger>
      <SelectContent>
        {options?.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">
            {requireJobTarget
              ? 'Nenhuma versão com vaga alvo associada.'
              : 'Nenhuma versão disponível.'}
          </p>
        )}
        {options?.map((variant) => (
          <SelectItem key={variant.id} value={variant.id}>
            {variant.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
