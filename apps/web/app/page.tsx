'use client';

import { Button, Card } from '@cvlab/ui';
import { useAuth } from '../lib/auth-context';

export default function HomePage() {
  const { user, isLoading, logout } = useAuth();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        Fase 2A — Motor de Currículo
      </span>

      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">CVLab AI</h1>

      <p className="max-w-xl text-slate-600 dark:text-slate-400">
        Construção de currículos assistida por IA, cartas de apresentação, análise ATS, testes
        técnicos e simulação de entrevistas — para o mercado de trabalho moçambicano.
      </p>

      <Card title="Estado" className="w-full max-w-md text-left">
        {isLoading ? (
          <p className="text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
            A carregar sessão…
          </p>
        ) : user ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Sessão iniciada como <span className="font-medium">{user.email}</span>
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => (window.location.href = '/dashboard/profile')}
              >
                Ir para o perfil
              </Button>
              <Button variant="ghost" onClick={() => logout()}>
                Sair
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">Ainda não iniciou sessão.</p>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => (window.location.href = '/login')}>
                Entrar
              </Button>
              <Button variant="secondary" onClick={() => (window.location.href = '/register')}>
                Criar conta
              </Button>
            </div>
          </div>
        )}
      </Card>
    </main>
  );
}
