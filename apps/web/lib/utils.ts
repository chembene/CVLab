import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merges conditional class names, then resolves Tailwind class conflicts (e.g. `p-2 p-4` -> `p-4`). Used by every component in components/ui/. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
