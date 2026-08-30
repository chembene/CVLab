import type { CSSProperties } from 'react';
import type { Profile } from '@/lib/api/profile';
import type { ResolvedTheme } from '@/lib/template-engine/types';
import { MARGIN_PX } from '@/lib/template-engine/theme';
import { HeaderRenderer } from '../renderers';
import { formatDate } from '@/lib/format';

export interface CoverLetterLayoutProps {
  title: string;
  body: string;
  profile?: Profile | null;
  theme: ResolvedTheme;
}

/**
 * Reuses the exact same rendering engine as ResumeLayout (Part 3: "Reuse
 * the same rendering engine") — same ResolvedTheme shape, same
 * HeaderRenderer. A letter has far less structure than a resume, so its 4
 * layout keys (letter-classic/letter-header-band/letter-modern/
 * letter-minimal) only vary header style + spacing, not a sidebar.
 */
export function CoverLetterLayout({ title, body, profile, theme }: CoverLetterLayoutProps) {
  const pageStyle: CSSProperties = {
    fontFamily: theme.typography.fontFamily,
    background: theme.colors.background,
    padding: MARGIN_PX[theme.spacing.pageMargin],
    color: theme.colors.text,
    fontSize: theme.typography.fontSizeBase,
    lineHeight: theme.typography.lineHeight,
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={pageStyle}>
      <HeaderRenderer profile={profile} title={title} theme={theme} />
      <p style={{ color: theme.colors.mutedText, marginBottom: 16 }}>{formatDate(new Date())}</p>
      <div style={{ whiteSpace: 'pre-wrap' }}>{body}</div>
    </div>
  );
}
