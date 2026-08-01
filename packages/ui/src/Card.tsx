import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  children: ReactNode;
}

/** Reusable content container with consistent spacing, border and radius. */
export function Card({ title, className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={[
        'rounded-lg border border-slate-200 bg-white p-6 shadow-sm',
        'dark:border-slate-800 dark:bg-slate-900',
        className,
      ].join(' ')}
      {...rest}
    >
      {title ? (
        <h3 className="mb-2 text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      ) : null}
      {children}
    </div>
  );
}
