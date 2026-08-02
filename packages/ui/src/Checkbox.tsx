import type { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** Accessible checkbox with an associated label. */
export function Checkbox({ label, id, className = '', ...rest }: CheckboxProps) {
  const inputId = id ?? rest.name ?? label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex items-center gap-2">
      <input
        id={inputId}
        type="checkbox"
        className={[
          'h-4 w-4 rounded border-slate-300 text-blue-600 dark:border-slate-700',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
          className,
        ].join(' ')}
        {...rest}
      />
      <label htmlFor={inputId} className="text-sm text-slate-700 dark:text-slate-300">
        {label}
      </label>
    </div>
  );
}
