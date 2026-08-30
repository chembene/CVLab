import type { CSSProperties } from 'react';
import {
  Mail,
  Phone,
  MapPin,
  Link2,
  Code2,
  Globe,
  Briefcase,
  GraduationCap,
  Wrench,
  Languages as LanguagesIcon,
  FolderGit2,
  Award,
  Users,
} from 'lucide-react';
import type { RendererProfile } from '../profile';
import type { ResolvedTheme } from '../types';
import { SectionShell, ItemTitle, ItemSubtitle, ItemDates } from './SectionShell';
import { SECTION_CONFIGS, type SectionItem } from '../section-fields';
import { formatDate } from '../format';

/**
 * Part 9 "Rendering Layer" — 9 named, shared, presentational renderer
 * components (as listed in the brief) plus one extra generic
 * `ListSectionRenderer` covering the 4 array sections the brief's list
 * doesn't name individually (courses/awards/publications/volunteer
 * experiences) — added for full content coverage, not a substitute for the
 * 9 named ones. Every renderer takes `(data, theme)` only: no template ever
 * imports one of these and changes its markup — templates only choose which
 * ones to call, and in what layout arrangement (see ../layouts).
 *
 * Moved out of apps/web unchanged during Export Engine PASSO 3 — see
 * docs/architecture/export-engine.md "Rendering".
 */

function asItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function str(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === 'string' ? value : '';
}

function dateRange(item: Record<string, unknown>, currentFlag?: string): string {
  const start = str(item, 'startDate');
  const end = str(item, 'endDate');
  const isCurrent = currentFlag ? Boolean(item[currentFlag]) : false;
  if (!start && !end && !isCurrent) return '';
  const startLabel = start ? formatDate(start) : '';
  const endLabel = isCurrent ? 'Atual' : end ? formatDate(end) : '';
  return [startLabel, endLabel].filter(Boolean).join(' — ');
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

export function HeaderRenderer({
  profile,
  title,
  theme,
}: {
  profile?: RendererProfile | null;
  title?: string;
  theme: ResolvedTheme;
}) {
  const name =
    profile?.displayName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
    'Nome do candidato';
  const isBand = theme.header.style === 'band';
  const containerStyle: CSSProperties = {
    padding: isBand ? '20px 16px' : '0 0 12px',
    background: isBand ? theme.colors.primary : 'transparent',
    color: isBand ? '#FFFFFF' : theme.colors.text,
    textAlign: theme.header.style === 'centered' ? 'center' : 'left',
    marginBottom: 16,
  };
  const contactStyle: CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    fontSize: theme.typography.fontSizeBase * 0.85,
    marginTop: 6,
    justifyContent: theme.header.style === 'centered' ? 'center' : 'flex-start',
    color: isBand ? '#F1F5F9' : theme.colors.mutedText,
  };

  const contacts: { icon: JSX.Element; value: string }[] = [];
  if (profile?.email) contacts.push({ icon: <Mail size={12} />, value: profile.email });
  if (profile?.phone) contacts.push({ icon: <Phone size={12} />, value: profile.phone });
  if (profile?.city)
    contacts.push({
      icon: <MapPin size={12} />,
      value: [profile.city, profile.country].filter(Boolean).join(', '),
    });
  if (profile?.linkedin) contacts.push({ icon: <Link2 size={12} />, value: profile.linkedin });
  if (profile?.github) contacts.push({ icon: <Code2 size={12} />, value: profile.github });
  if (profile?.website || profile?.portfolio)
    contacts.push({
      icon: <Globe size={12} />,
      value: (profile?.website || profile?.portfolio) ?? '',
    });

  return (
    <header style={containerStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          justifyContent: theme.header.style === 'centered' ? 'center' : 'flex-start',
        }}
      >
        {theme.photoEnabled && profile?.photoUrl && (
          <img
            src={profile.photoUrl}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            style={{
              borderRadius: '50%',
              objectFit: 'cover',
              border: `2px solid ${isBand ? '#FFFFFF' : theme.colors.secondary}`,
            }}
          />
        )}
        <div>
          <h1 style={{ fontSize: theme.typography.fontSizeBase * 1.8, fontWeight: 700, margin: 0 }}>
            {name}
          </h1>
          {(title || profile?.headline) && (
            <p
              style={{
                fontSize: theme.typography.fontSizeBase * 1.05,
                margin: '2px 0 0',
                color: isBand ? '#E2E8F0' : theme.colors.secondary,
              }}
            >
              {title || profile?.headline}
            </p>
          )}
        </div>
      </div>
      {contacts.length > 0 && (
        <div style={contactStyle}>
          {contacts.map((c, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {theme.iconsEnabled && c.icon}
              {c.value}
            </span>
          ))}
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function SummaryRenderer({
  summary,
  theme,
}: {
  summary?: string | null;
  theme: ResolvedTheme;
}) {
  if (!summary) return null;
  return (
    <SectionShell theme={theme} title="Resumo Profissional">
      <p style={{ margin: 0 }}>{summary}</p>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

export function ExperienceRenderer({ items, theme }: { items: unknown; theme: ResolvedTheme }) {
  const list = asItems(items);
  if (list.length === 0) return null;
  const config = SECTION_CONFIGS['work-experience'];
  return (
    <SectionShell
      theme={theme}
      title="Experiência Profissional"
      icon={<Briefcase size={theme.typography.fontSizeBase} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((item, i) => (
          <div key={i}>
            <ItemTitle theme={theme}>{config.title(item as unknown as SectionItem)}</ItemTitle>
            <ItemSubtitle theme={theme}>
              {config.subtitle(item as unknown as SectionItem)}
            </ItemSubtitle>
            <ItemDates theme={theme}>{dateRange(item, 'currentlyWorking')}</ItemDates>
            {str(item, 'description') && (
              <p style={{ margin: '4px 0 0' }}>{str(item, 'description')}</p>
            )}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Education
// ---------------------------------------------------------------------------

export function EducationRenderer({ items, theme }: { items: unknown; theme: ResolvedTheme }) {
  const list = asItems(items);
  if (list.length === 0) return null;
  const config = SECTION_CONFIGS.education;
  return (
    <SectionShell
      theme={theme}
      title="Formação Académica"
      icon={<GraduationCap size={theme.typography.fontSizeBase} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((item, i) => (
          <div key={i}>
            <ItemTitle theme={theme}>{config.title(item as unknown as SectionItem)}</ItemTitle>
            <ItemSubtitle theme={theme}>
              {config.subtitle(item as unknown as SectionItem)}
            </ItemSubtitle>
            <ItemDates theme={theme}>{dateRange(item)}</ItemDates>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export function SkillsRenderer({ items, theme }: { items: unknown; theme: ResolvedTheme }) {
  const list = asItems(items);
  if (list.length === 0) return null;
  return (
    <SectionShell
      theme={theme}
      title="Competências"
      icon={<Wrench size={theme.typography.fontSizeBase} />}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {list.map((item, i) => (
          <span
            key={i}
            style={{
              background: `${theme.colors.secondary}22`,
              color: theme.colors.primary,
              borderRadius: 999,
              padding: '2px 10px',
              fontSize: theme.typography.fontSizeBase * 0.85,
            }}
          >
            {str(item, 'name')}
          </span>
        ))}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Languages
// ---------------------------------------------------------------------------

export function LanguagesRenderer({ items, theme }: { items: unknown; theme: ResolvedTheme }) {
  const list = asItems(items);
  if (list.length === 0) return null;
  return (
    <SectionShell
      theme={theme}
      title="Idiomas"
      icon={<LanguagesIcon size={theme.typography.fontSizeBase} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {list.map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{str(item, 'language')}</span>
            <span style={{ color: theme.colors.mutedText }}>{str(item, 'proficiency')}</span>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export function ProjectsRenderer({ items, theme }: { items: unknown; theme: ResolvedTheme }) {
  const list = asItems(items);
  if (list.length === 0) return null;
  return (
    <SectionShell
      theme={theme}
      title="Projetos"
      icon={<FolderGit2 size={theme.typography.fontSizeBase} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {list.map((item, i) => (
          <div key={i}>
            <ItemTitle theme={theme}>{str(item, 'title')}</ItemTitle>
            {str(item, 'description') && (
              <p style={{ margin: '2px 0 0' }}>{str(item, 'description')}</p>
            )}
            {str(item, 'url') && <ItemSubtitle theme={theme}>{str(item, 'url')}</ItemSubtitle>}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Certifications
// ---------------------------------------------------------------------------

export function CertificationRenderer({ items, theme }: { items: unknown; theme: ResolvedTheme }) {
  const list = asItems(items);
  if (list.length === 0) return null;
  const config = SECTION_CONFIGS.certificates;
  return (
    <SectionShell
      theme={theme}
      title="Certificados"
      icon={<Award size={theme.typography.fontSizeBase} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((item, i) => (
          <div key={i}>
            <ItemTitle theme={theme}>{config.title(item as unknown as SectionItem)}</ItemTitle>
            <ItemSubtitle theme={theme}>
              {config.subtitle(item as unknown as SectionItem)}
            </ItemSubtitle>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function ReferenceRenderer({ items, theme }: { items: unknown; theme: ResolvedTheme }) {
  const list = asItems(items);
  if (list.length === 0) return null;
  return (
    <SectionShell
      theme={theme}
      title="Referências"
      icon={<Users size={theme.typography.fontSizeBase} />}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((item, i) => (
          <div key={i}>
            <ItemTitle theme={theme}>{str(item, 'name')}</ItemTitle>
            <ItemSubtitle theme={theme}>
              {[str(item, 'position'), str(item, 'company')].filter(Boolean).join(' · ')}
            </ItemSubtitle>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

// ---------------------------------------------------------------------------
// Generic list section (courses / awards / publications / volunteer
// experiences) — the 4 array sections not individually named in the brief's
// renderer list, covered here so the content model's remaining sections are
// never silently dropped from any template.
// ---------------------------------------------------------------------------

const GENERIC_TITLES: Record<string, string> = {
  courses: 'Cursos',
  awards: 'Prémios',
  publications: 'Publicações',
  volunteerExperiences: 'Voluntariado',
};

export function ListSectionRenderer({
  sectionKey,
  items,
  theme,
}: {
  sectionKey: keyof typeof GENERIC_TITLES;
  items: unknown;
  theme: ResolvedTheme;
}) {
  const list = asItems(items);
  if (list.length === 0) return null;
  return (
    <SectionShell theme={theme} title={GENERIC_TITLES[sectionKey] ?? sectionKey}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((item, i) => (
          <div key={i}>
            <ItemTitle theme={theme}>{str(item, 'title') || str(item, 'organization')}</ItemTitle>
            <ItemSubtitle theme={theme}>
              {[
                str(item, 'issuer'),
                str(item, 'provider'),
                str(item, 'publisher'),
                str(item, 'role'),
              ]
                .filter(Boolean)
                .join(' · ')}
            </ItemSubtitle>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}
