'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { NAV_GROUPS } from '@/lib/nav-items';
import { cn } from '@/lib/utils';

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4"
      aria-label="Navegação principal"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-sidebar-foreground/50">
            {group.title}
          </h2>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-sidebar-accent text-sidebar-foreground'
                        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Desktop-only fixed sidebar (`hidden lg:flex`) — the mobile equivalent is MobileNav's Sheet, both driven by the same SidebarNav content. */
export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
        <span className="text-lg font-semibold text-sidebar-foreground">CVLab AI</span>
      </div>
      <SidebarNav />
    </aside>
  );
}
