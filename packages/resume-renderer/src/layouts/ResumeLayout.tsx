import type { CSSProperties, ReactNode } from 'react';
import type { RendererProfile } from '../profile';
import type { ResolvedTheme } from '../types';
import { MARGIN_PX } from '../theme';
import {
  HeaderRenderer,
  SummaryRenderer,
  ExperienceRenderer,
  EducationRenderer,
  SkillsRenderer,
  LanguagesRenderer,
  ProjectsRenderer,
  CertificationRenderer,
  ReferenceRenderer,
  ListSectionRenderer,
} from '../renderers';

export interface ResumeLayoutProps {
  content: Record<string, unknown>;
  profile?: RendererProfile | null;
  theme: ResolvedTheme;
  supportedSections: string[];
}

/**
 * Part 9 — "Templates define layout only." One component, 5 arrangements
 * (keyed by `theme.layout.key`, resolved from the DB row's `layout`
 * column — see ../theme.ts), all built from the exact same 9+1 renderer
 * set. Adding an 11th resume template that reuses one of these 5 layout
 * keys requires ZERO changes here — only a new catalog row.
 *
 * Moved out of apps/web unchanged during Export Engine PASSO 3 — see
 * docs/architecture/export-engine.md "Rendering". This is the exact
 * component both apps/web's live preview AND apps/api's PDF export render —
 * "Preview ≈ Export" by construction, not by convention.
 */
export function ResumeLayout({ content, profile, theme, supportedSections }: ResumeLayoutProps) {
  const supports = (key: string) => supportedSections.includes(key);

  const mainSections: ReactNode[] = [
    supports('summary') && (
      <SummaryRenderer
        key="summary"
        summary={typeof content.summary === 'string' ? content.summary : ''}
        theme={theme}
      />
    ),
    supports('workExperiences') && (
      <ExperienceRenderer key="workExperiences" items={content.workExperiences} theme={theme} />
    ),
    supports('educations') && (
      <EducationRenderer key="educations" items={content.educations} theme={theme} />
    ),
    supports('projects') && (
      <ProjectsRenderer key="projects" items={content.projects} theme={theme} />
    ),
    supports('courses') && (
      <ListSectionRenderer
        key="courses"
        sectionKey="courses"
        items={content.courses}
        theme={theme}
      />
    ),
    supports('awards') && (
      <ListSectionRenderer key="awards" sectionKey="awards" items={content.awards} theme={theme} />
    ),
    supports('publications') && (
      <ListSectionRenderer
        key="publications"
        sectionKey="publications"
        items={content.publications}
        theme={theme}
      />
    ),
    supports('volunteerExperiences') && (
      <ListSectionRenderer
        key="volunteerExperiences"
        sectionKey="volunteerExperiences"
        items={content.volunteerExperiences}
        theme={theme}
      />
    ),
    supports('references') && (
      <ReferenceRenderer key="references" items={content.references} theme={theme} />
    ),
  ].filter(Boolean);

  const sideSections: ReactNode[] = [
    supports('skills') && <SkillsRenderer key="skills" items={content.skills} theme={theme} />,
    supports('languages') && (
      <LanguagesRenderer key="languages" items={content.languages} theme={theme} />
    ),
    supports('certificates') && (
      <CertificationRenderer key="certificates" items={content.certificates} theme={theme} />
    ),
  ].filter(Boolean);

  const pageStyle: CSSProperties = {
    fontFamily: theme.typography.fontFamily,
    background: theme.colors.background,
    padding: MARGIN_PX[theme.spacing.pageMargin],
    color: theme.colors.text,
    width: '100%',
    boxSizing: 'border-box',
  };

  const title = typeof content.title === 'string' ? content.title : undefined;

  if (theme.layout.sidebar.enabled) {
    const sidebarFirst = theme.layout.sidebar.position === 'left';
    const sidebar = (
      <aside
        style={{
          width: '32%',
          minWidth: 160,
          background: `${theme.colors.primary}0d`,
          padding: 16,
          borderRadius: 6,
          boxSizing: 'border-box',
        }}
      >
        {sideSections}
      </aside>
    );
    const main = <div style={{ flex: 1, minWidth: 0 }}>{mainSections}</div>;

    return (
      <div style={pageStyle}>
        <HeaderRenderer profile={profile} title={title} theme={theme} />
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {sidebarFirst ? (
            <>
              {sidebar}
              {main}
            </>
          ) : (
            <>
              {main}
              {sidebar}
            </>
          )}
        </div>
      </div>
    );
  }

  // single-column / header-band / any other layout without a sidebar —
  // side sections render inline, right after the main ones.
  return (
    <div style={pageStyle}>
      <HeaderRenderer profile={profile} title={title} theme={theme} />
      {mainSections}
      {sideSections}
    </div>
  );
}
