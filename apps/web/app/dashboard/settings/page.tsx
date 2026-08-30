'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Monitor, Moon, Sun, ShieldAlert } from 'lucide-react';
import { useTheme } from 'next-themes';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/lib/auth-context';
import { apiFetch, ApiError } from '@/lib/api-client';

const THEME_OPTIONS = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
] as const;

export default function SettingsPage() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [confirmLogoutAll, setConfirmLogoutAll] = useState(false);

  async function handleLogoutAll() {
    try {
      await apiFetch('/auth/logout-all', { method: 'POST' });
      toast.success('Todas as sessões foram terminadas.');
      await logout();
      router.replace('/login');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Não foi possível terminar as sessões.');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Definições" description="Preferências da conta e da aplicação." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conta</CardTitle>
          <CardDescription>Dados de identificação da sua conta.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">E-mail</span>
            <span className="font-medium">{user?.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Função</span>
            <span className="font-medium">{user?.role}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aparência</CardTitle>
          <CardDescription>
            Escolha como o CVLab AI é apresentado neste dispositivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2">
          {THEME_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={theme === option.value ? 'default' : 'outline'}
              onClick={() => setTheme(option.value)}
              className="flex-1"
            >
              <option.icon className="h-4 w-4" />
              {option.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Palavra-passe</CardTitle>
          <CardDescription>Alteração de palavra-passe enquanto sessão iniciada.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Ainda não disponível</AlertTitle>
            <AlertDescription>
              O backend expõe atualmente apenas o fluxo de recuperação de palavra-passe (para quando
              não tem sessão iniciada). Para alterar a sua palavra-passe agora,{' '}
              <Button variant="link" className="h-auto p-0" asChild>
                <a href="/login">
                  saia da sessão e utilize &quot;Esqueci-me da palavra-passe&quot;
                </a>
              </Button>
              .
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Separator />

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Zona de risco</CardTitle>
          <CardDescription>
            Termina a sessão em todos os dispositivos onde tenha entrado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirmLogoutAll(true)}>
            Terminar todas as sessões
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmLogoutAll}
        onOpenChange={setConfirmLogoutAll}
        title="Terminar todas as sessões?"
        description="Irá terminar sessão neste e em todos os outros dispositivos. Terá de entrar novamente."
        confirmLabel="Terminar sessões"
        destructive
        onConfirm={handleLogoutAll}
      />
    </div>
  );
}
