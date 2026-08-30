import { z } from 'zod';

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .refine(
    (value) => !value || /^https?:\/\/.+/.test(value),
    'Introduza um URL válido (https://...).',
  );

export const profileSchema = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  displayName: z.string().trim().max(150).optional(),
  headline: z.string().trim().max(200).optional(),
  phone: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || /^\+?[0-9]{7,15}$/.test(value),
      'Introduza um número de telefone válido.',
    ),
  email: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || z.string().email().safeParse(value).success,
      'Introduza um e-mail válido.',
    ),
  country: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  address: z.string().trim().max(300).optional(),
  birthDate: z.string().trim().optional(),
  linkedin: optionalUrl,
  github: optionalUrl,
  portfolio: optionalUrl,
  website: optionalUrl,
  photoUrl: optionalUrl,
  bio: z.string().trim().max(2000).optional(),
});

export type ProfileFormInput = z.infer<typeof profileSchema>;
