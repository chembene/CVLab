'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@cvlab/ui';
import { useAuth } from '../../lib/auth-context';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-600 dark:text-slate-400" aria-live="polite">
          A carregar…
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <nav className="flex gap-4 text-sm font-medium">
            <a
              href="/dashboard/profile"
              className="text-slate-700 hover:text-blue-700 dark:text-slate-300"
            >
              Perfil
            </a>
            <a
              href="/dashboard/resume"
              className="text-slate-700 hover:text-blue-700 dark:text-slate-300"
            >
              Currículo
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600 dark:text-slate-400">{user.email}</span>
            <Button variant="ghost" onClick={() => logout().then(() => router.replace('/login'))}>
              Sair
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>
    </div>
  );
}
