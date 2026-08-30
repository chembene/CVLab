import type { CSSProperties, ReactNode } from 'react';
import type { ResolvedTheme } from '../types';
import { SPACING_PX } from '../theme';

interface SectionShellProps {
  theme: ResolvedTheme;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}

/**
 * Part 9 "Rendering Layer" — the one shared shell every named section
 * renderer below is built on: a themed heading + a themed content gap.
 * Templates never define their own heading markup; they only pick a
 * `layout`/theme, which this shell (and SPACING_PX/theme.ts) translate into
 * real CSS.
 *
 * Moved out of apps/web unchanged during Export Engine PASSO 3 — see
 * docs/architecture/export-engine.md "Rendering".
 */
export function SectionShell({ theme, title, icon, children }: SectionShellProps) {
  const style: CSSProperties = { marginBottom: SPACING_PX[theme.spacing.sectionGap] };
  const headingStyle: CSSProperties = {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSizeBase * theme.typography.headingScale,
    borderBottom:
      theme.header.dividerStyle === 'line' ? `1px solid ${theme.colors.secondary}` : undefined,
    borderBottomStyle: theme.header.dividerStyle === 'dotted' ? 'dotted' : undefined,
    marginBottom: 6,
    paddingBottom: theme.header.dividerStyle === 'none' ? 0 : 4,
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  };

  return (
    <section style={style} data-section={title}>
      <h3 style={headingStyle}>
        {theme.iconsEnabled && icon}
        {title}
      </h3>
      <div
        style={{
          fontSize: theme.typography.fontSizeBase,
          lineHeight: theme.typography.lineHeight,
          color: theme.colors.text,
        }}
      >
        {children}
      </div>
    </section>
  );
}

export function ItemTitle({
  theme: _theme,
  children,
}: {
  theme: ResolvedTheme;
  children: ReactNode;
}) {
  return <div style={{ fontWeight: 600 }}>{children}</div>;
}

export function ItemSubtitle({ theme, children }: { theme: ResolvedTheme; children: ReactNode }) {
  return (
    <div style={{ color: theme.colors.mutedText, fontSize: theme.typography.fontSizeBase * 0.9 }}>
      {children}
    </div>
  );
}

export function ItemDates({ theme, children }: { theme: ResolvedTheme; children: ReactNode }) {
  return (
    <div style={{ color: theme.colors.mutedText, fontSize: theme.typography.fontSizeBase * 0.85 }}>
      {children}
    </div>
  );
}
