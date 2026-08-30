import { z } from 'zod';

export const masterResumeSchema = z.object({
  title: z.string().trim().max(150).optional(),
  summary: z.string().trim().max(2000).optional(),
  careerLevel: z.string().trim().max(50).optional(),
  yearsExperience: z.union([z.string().length(0), z.coerce.number().min(0).max(60)]).optional(),
  desiredPosition: z.string().trim().max(150).optional(),
  desiredSalary: z.union([z.string().length(0), z.coerce.number().min(0)]).optional(),
  currency: z.string().trim().max(3).optional(),
  visibility: z.string().trim().max(20).optional(),
  status: z.string().trim().max(20).optional(),
});

export type MasterResumeFormInput = z.infer<typeof masterResumeSchema>;
