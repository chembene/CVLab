'use client';

import { useState, type ReactNode } from 'react';
import { Monitor, Tablet, Smartphone, FileText, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PreviewDevice = 'desktop' | 'tablet' | 'a4' | 'print' | 'mobile';

const DEVICE_WIDTHS: Record<PreviewDevice, number> = {
  desktop: 900,
  tablet: 768,
  a4: 794, // 210mm at 96dpi — a real A4 page width approximation, not a guess
  print: 794,
  mobile: 390,
};

const DEVICE_LABELS: Record<PreviewDevice, string> = {
  desktop: 'Ambiente de Trabalho',
  tablet: 'Tablet',
  a4: 'A4',
  print: 'Impressão',
  mobile: 'Telemóvel',
};

const DEVICE_ICONS: Record<PreviewDevice, typeof Monitor> = {
  desktop: Monitor,
  tablet: Tablet,
  a4: FileText,
  print: Printer,
  mobile: Smartphone,
};

/**
 * Part 10 "Responsive Preview" — Desktop/Tablet/A4/Print/Mobile presets. A4
 * and Print share the same real paper-width approximation (210mm @ 96dpi);
 * "print preview" here means "what the A4 page looks like", not a second
 * rendering pipeline through an actual print driver — no PDF engine exists
 * yet (Part 12/roadmap "PDF Export — future").
 */
export function ResponsivePreviewFrame({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<PreviewDevice>('a4');
  const width = DEVICE_WIDTHS[device];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-wrap justify-center gap-1 rounded-md border border-border bg-muted/40 p-1">
        {(Object.keys(DEVICE_WIDTHS) as PreviewDevice[]).map((d) => {
          const Icon = DEVICE_ICONS[d];
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              className={cn(
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                device === d
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={device === d}
            >
              <Icon className="h-3.5 w-3.5" />
              {DEVICE_LABELS[d]}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          'overflow-auto rounded-md border border-border bg-white shadow-sm transition-[width] duration-200',
          device === 'print' && 'grayscale-0',
        )}
        style={{ width, maxWidth: '100%' }}
        data-testid="preview-frame"
        data-device={device}
      >
        {children}
      </div>
    </div>
  );
}
