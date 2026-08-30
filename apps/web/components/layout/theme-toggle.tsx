'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Cycles light -> dark -> system. Renders a stable placeholder until mounted to avoid a hydration mismatch (next-themes reads localStorage client-side only). */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <Button variant="ghost" size="icon" aria-label="Alternar tema" disabled />;
  }

  const next = theme === 'light' ? 'dark' : 'light';

  return (
    <Button variant="ghost" size="icon" aria-label="Alternar tema" onClick={() => setTheme(next)}>
      <Sun className="hidden h-4 w-4 dark:block" />
      <Moon className="block h-4 w-4 dark:hidden" />
    </Button>
  );
}
