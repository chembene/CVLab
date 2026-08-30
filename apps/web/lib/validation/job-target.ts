import { z } from 'zod';
import { JobTargetStatus } from '@cvlab/types';

export const jobTargetSchema = z.object({
  title: z.string().trim().min(1, 'O título é obrigatório.').max(200),
  company: z.string().trim().max(150).optional(),
  location: z.string().trim().max(150).optional(),
  employmentType: z.string().trim().max(50).optional(),
  seniority: z.string().trim().max(50).optional(),
  salaryMin: z.union([z.string().length(0), z.coerce.number().min(0)]).optional(),
  salaryMax: z.union([z.string().length(0), z.coerce.number().min(0)]).optional(),
  currency: z.string().trim().max(3).optional(),
  jobUrl: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^https?:\/\/.+/.test(value), 'Introduza um URL válido.'),
  jobDescription: z.string().trim().max(20000).optional(),
  status: z.nativeEnum(JobTargetStatus).optional(),
  notes: z.string().trim().max(2000).optional(),
  keywords: z.string().trim().optional(),
  requiredSkills: z.string().trim().optional(),
  optionalSkills: z.string().trim().optional(),
  languages: z.string().trim().optional(),
});

export type JobTargetFormInput = z.infer<typeof jobTargetSchema>;

function splitTags(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function jobTargetFormToPayload(values: JobTargetFormInput) {
  return {
    title: values.title,
    company: values.company || undefined,
    location: values.location || undefined,
    employmentType: values.employmentType || undefined,
    seniority: values.seniority || undefined,
    salaryMin:
      values.salaryMin === '' || values.salaryMin == null ? undefined : Number(values.salaryMin),
    salaryMax:
      values.salaryMax === '' || values.salaryMax == null ? undefined : Number(values.salaryMax),
    currency: values.currency || undefined,
    jobUrl: values.jobUrl || undefined,
    jobDescription: values.jobDescription || undefined,
    status: values.status || undefined,
    notes: values.notes || undefined,
    keywords: splitTags(values.keywords).map((keyword) => ({ keyword })),
    skills: [
      ...splitTags(values.requiredSkills).map((skill) => ({ skill, required: true })),
      ...splitTags(values.optionalSkills).map((skill) => ({ skill, required: false })),
    ],
    languages: splitTags(values.languages).map((language) => ({ language })),
  };
}
