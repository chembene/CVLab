'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@cvlab/ui';
import { useAuth } from '../../lib/auth-context';
import { ApiError } from '../../lib/api-client';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('As palavras-passe não coincidem.');
      return;
    }

    setSubmitting(true);
    try {
      await register(email, password);
      router.push('/dashboard/profile');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Não foi possível criar a conta. Tente novamente.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-bold">Criar conta</h1>
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <Input
            label="E-mail"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Palavra-passe"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Input
            label="Confirmar palavra-passe"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mínimo de 10 caracteres, com maiúsculas, minúsculas e números.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'A criar conta…' : 'Criar conta'}
          </Button>
        </form>
      </Card>
      <p className="text-center text-sm text-slate-600 dark:text-slate-400">
        Já tem conta?{' '}
        <a href="/login" className="font-medium text-blue-700 dark:text-blue-400">
          Entrar
        </a>
      </p>
    </main>
  );
}
