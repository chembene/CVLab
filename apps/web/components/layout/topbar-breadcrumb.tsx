'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { ALL_NAV_ITEMS } from '@/lib/nav-items';

/** Auto-derived from the current route against the nav registry — page-specific sub-routes (e.g. a job target's own id) layer their own trail via <PageHeader breadcrumbs>, this is just the top-level "where am I" indicator required by the LAYOUT spec. */
export function TopbarBreadcrumb() {
  const pathname = usePathname();
  const match = ALL_NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex"
    >
      <Link href="/dashboard" className="flex items-center hover:text-foreground">
        <Home className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      {match && match.href !== '/dashboard' && (
        <>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-medium text-foreground">{match.label}</span>
        </>
      )}
    </nav>
  );
}
