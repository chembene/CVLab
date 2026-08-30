import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'O e-mail é obrigatório.').email('Introduza um e-mail válido.'),
  password: z.string().min(1, 'A palavra-passe é obrigatória.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    email: z.string().min(1, 'O e-mail é obrigatório.').email('Introduza um e-mail válido.'),
    password: z
      .string()
      .min(10, 'Mínimo de 10 caracteres.')
      .regex(/[a-z]/, 'Deve incluir uma letra minúscula.')
      .regex(/[A-Z]/, 'Deve incluir uma letra maiúscula.')
      .regex(/[0-9]/, 'Deve incluir um número.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As palavras-passe não coincidem.',
    path: ['confirmPassword'],
  });
export type RegisterInput = z.infer<typeof registerSchema>;
