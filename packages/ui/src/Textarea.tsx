import type { TextareaHTMLAttributes } from 'react';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

/** Accessible multi-line text input, same label/error pattern as Input. */
export function Textarea({ label, error, id, className = '', ...rest }: TextareaProps) {
  const inputId = id ?? rest.name ?? label.toLowerCase().replace(/\s+/g, '-');
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <textarea
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        rows={4}
        className={[
          'rounded-md border px-3 py-2 text-sm text-slate-900 dark:text-slate-100',
          'bg-white dark:bg-slate-900',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
          error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700',
          className,
        ].join(' ')}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
