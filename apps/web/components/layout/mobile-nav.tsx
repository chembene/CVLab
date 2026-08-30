'use client';

import { useState } from 'react';
import { Menu, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SidebarNav } from './sidebar';

/** Hamburger-triggered drawer for small screens — reuses SidebarNav's exact link list so mobile and desktop navigation can never drift apart. */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Abrir menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      <SheetContent
        side="left"
        className="flex w-72 flex-col bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <span className="text-lg font-semibold">CVLab AI</span>
        </div>
        <div onClick={() => setOpen(false)} className="flex flex-1 flex-col overflow-hidden">
          <SidebarNav />
        </div>
      </SheetContent>
    </Sheet>
  );
}
