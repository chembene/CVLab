'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Mock data — no `/notifications` endpoint has been implemented by any
 * backend phase (Phase 0's `Notification` Prisma model is schema-only,
 * exactly like the also-still-dormant `Cv`/`CvVersion`). This component is
 * wired for a real feed (same shape a future `GET /notifications` would
 * return) so swapping in a React Query hook later is a one-line change —
 * see docs/frontend/frontend-architecture.md "Mock data disclosure".
 */
const MOCK_NOTIFICATIONS = [
  {
    id: '1',
    title: 'Relatório ATS concluído',
    description: 'A sua análise ATS está pronta para revisão.',
    unread: true,
  },
  {
    id: '2',
    title: 'Créditos a acabar',
    description: 'Restam menos de 20 créditos na sua carteira.',
    unread: true,
  },
  {
    id: '3',
    title: 'Otimização concluída',
    description: 'A IA gerou novas sugestões para o seu currículo.',
    unread: false,
  },
];

export function NotificationsMenu() {
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => n.unread).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full p-0 text-[10px]"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MOCK_NOTIFICATIONS.map((notification) => (
          <DropdownMenuItem
            key={notification.id}
            className="flex flex-col items-start gap-0.5 py-2"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              {notification.unread && (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              )}
              {notification.title}
            </span>
            <span className="text-xs text-muted-foreground">{notification.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
