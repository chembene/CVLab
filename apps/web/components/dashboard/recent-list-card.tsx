import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export interface RecentListItem {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

interface RecentListCardProps {
  title: string;
  icon: LucideIcon;
  items: RecentListItem[] | undefined;
  isLoading: boolean;
  viewAllHref: string;
  emptyLabel: string;
}

/** One "Recent X" panel on the dashboard — ATS, Optimizations, Cover Letters, Interviews all share this shape. */
export function RecentListCard({
  title,
  icon: Icon,
  items,
  isLoading,
  viewAllHref,
  emptyLabel,
}: RecentListCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {title}
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href={viewAllHref}>
            Ver todos
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <>
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </>
        ) : !items || items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          items.slice(0, 4).map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="flex items-center justify-between rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
            >
              <span className="truncate font-medium">{item.title}</span>
              <span className="ml-2 shrink-0 text-xs text-muted-foreground">{item.subtitle}</span>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
