import { render, screen } from '@testing-library/react';
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
} from './index';
import { resolveTheme } from '@/lib/template-engine/theme';
import type { TemplateMetadata } from '@/lib/api/templates';
import type { Profile } from '@/lib/api/profile';

const template: TemplateMetadata = {
  id: 'ats-classic',
  name: 'ATS Classic',
  category: 'ATS_CLASSIC',
  previewImage: null,
  thumbnail: null,
  isATSFriendly: true,
  premium: false,
  version: 1,
  primaryColor: '#111827',
  secondaryColor: '#374151',
  font: 'Arial',
  layout: 'single-column',
  supportedSections: [],
  status: 'ACTIVE',
};

const theme = resolveTheme(template, undefined);

function makeTemplate(overrides: Partial<TemplateMetadata>): TemplateMetadata {
  return { ...template, ...overrides };
}

describe('Part 9 renderers', () => {
  describe('HeaderRenderer', () => {
    it('prefers profile.displayName, falls back to first+last name, then a placeholder', () => {
      const { rerender } = render(
        <HeaderRenderer profile={{ displayName: 'Maria C.' } as Profile} theme={theme} />,
      );
      expect(screen.getByText('Maria C.')).toBeInTheDocument();

      rerender(
        <HeaderRenderer
          profile={{ firstName: 'Maria', lastName: 'Chembe' } as Profile}
          theme={theme}
        />,
      );
      expect(screen.getByText('Maria Chembe')).toBeInTheDocument();

      rerender(<HeaderRenderer profile={null} theme={theme} />);
      expect(screen.getByText('Nome do candidato')).toBeInTheDocument();
    });

    it('only renders a contact for fields that are actually present on the profile', () => {
      const { container } = render(
        <HeaderRenderer
          profile={{ displayName: 'Maria', email: 'maria@example.com' } as Profile}
          theme={theme}
        />,
      );
      expect(screen.getByText('maria@example.com')).toBeInTheDocument();
      // phone/linkedin/github/website weren't supplied — no stray contact rows
      expect(container.querySelectorAll('header > div + div > span')).toHaveLength(1);
    });

    it('prefers the passed-in title over profile.headline', () => {
      render(
        <HeaderRenderer
          profile={{ displayName: 'Maria', headline: 'Engenheira' } as Profile}
          title="Gestora de Produto"
          theme={theme}
        />,
      );
      expect(screen.getByText('Gestora de Produto')).toBeInTheDocument();
      expect(screen.queryByText('Engenheira')).not.toBeInTheDocument();
    });

    it('renders the profile photo lazily (never blocking) when the theme and profile both support one', () => {
      const photoTheme = resolveTheme(makeTemplate({ layout: 'sidebar-left' }), undefined); // sidebar-left supports photo
      const { container } = render(
        <HeaderRenderer
          profile={
            { displayName: 'Maria', photoUrl: 'https://cdn.example.com/photo.jpg' } as Profile
          }
          theme={photoTheme}
        />,
      );
      const img = container.querySelector('img');
      expect(img).toHaveAttribute('src', 'https://cdn.example.com/photo.jpg');
      expect(img).toHaveAttribute('loading', 'lazy');
      expect(img).toHaveAttribute('decoding', 'async');
    });

    it('never renders a photo when the layout does not support one, even if the profile has a photoUrl', () => {
      // `theme` (module-level fixture) uses layout: 'single-column', which doesn't support photos.
      const { container } = render(
        <HeaderRenderer
          profile={
            { displayName: 'Maria', photoUrl: 'https://cdn.example.com/photo.jpg' } as Profile
          }
          theme={theme}
        />,
      );
      expect(container.querySelector('img')).not.toBeInTheDocument();
    });
  });

  describe('SummaryRenderer', () => {
    it('renders nothing when summary is empty/undefined', () => {
      const { container } = render(<SummaryRenderer summary={undefined} theme={theme} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders the summary text under its section heading', () => {
      render(<SummaryRenderer summary="Engenheira com 5 anos de experiência." theme={theme} />);
      expect(screen.getByText('Resumo Profissional')).toBeInTheDocument();
      expect(screen.getByText('Engenheira com 5 anos de experiência.')).toBeInTheDocument();
    });
  });

  describe('ExperienceRenderer', () => {
    it('renders nothing for an empty/non-array items value', () => {
      const { container } = render(<ExperienceRenderer items={undefined} theme={theme} />);
      expect(container).toBeEmptyDOMElement();
    });

    it('renders each work experience item using the shared SECTION_CONFIGS title/subtitle', () => {
      render(
        <ExperienceRenderer
          items={[
            {
              position: 'Engenheira de Software',
              company: 'CVLab',
              description: 'Construí o motor de modelos.',
            },
          ]}
          theme={theme}
        />,
      );
      expect(screen.getByText('Experiência Profissional')).toBeInTheDocument();
      expect(screen.getByText('Engenheira de Software')).toBeInTheDocument();
      expect(screen.getByText('CVLab')).toBeInTheDocument();
      expect(screen.getByText('Construí o motor de modelos.')).toBeInTheDocument();
    });
  });

  describe('EducationRenderer', () => {
    it('renders nothing when there are no education items', () => {
      const { container } = render(<EducationRenderer items={[]} theme={theme} />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('SkillsRenderer', () => {
    it('renders one pill per skill, keyed off item.name', () => {
      render(<SkillsRenderer items={[{ name: 'TypeScript' }, { name: 'NestJS' }]} theme={theme} />);
      expect(screen.getByText('TypeScript')).toBeInTheDocument();
      expect(screen.getByText('NestJS')).toBeInTheDocument();
    });
  });

  describe('LanguagesRenderer', () => {
    it('renders the language and its proficiency side by side', () => {
      render(
        <LanguagesRenderer
          items={[{ language: 'Português', proficiency: 'Nativo' }]}
          theme={theme}
        />,
      );
      expect(screen.getByText('Português')).toBeInTheDocument();
      expect(screen.getByText('Nativo')).toBeInTheDocument();
    });
  });

  describe('ProjectsRenderer', () => {
    it('renders title, description and url when present', () => {
      render(
        <ProjectsRenderer
          items={[
            {
              title: 'CVLab AI',
              description: 'Plataforma de carreira.',
              url: 'https://cvlab.example',
            },
          ]}
          theme={theme}
        />,
      );
      expect(screen.getByText('CVLab AI')).toBeInTheDocument();
      expect(screen.getByText('Plataforma de carreira.')).toBeInTheDocument();
      expect(screen.getByText('https://cvlab.example')).toBeInTheDocument();
    });
  });

  describe('CertificationRenderer', () => {
    it('renders nothing for an empty list', () => {
      const { container } = render(<CertificationRenderer items={[]} theme={theme} />);
      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('ReferenceRenderer', () => {
    it('joins position and company with a middle dot', () => {
      render(
        <ReferenceRenderer
          items={[{ name: 'João Silva', position: 'CTO', company: 'Acme' }]}
          theme={theme}
        />,
      );
      expect(screen.getByText('João Silva')).toBeInTheDocument();
      expect(screen.getByText('CTO · Acme')).toBeInTheDocument();
    });
  });

  describe('ListSectionRenderer', () => {
    it('maps sectionKey to a Portuguese section title', () => {
      render(
        <ListSectionRenderer
          sectionKey="courses"
          items={[{ title: 'AWS Certified', provider: 'Amazon' }]}
          theme={theme}
        />,
      );
      expect(screen.getByText('Cursos')).toBeInTheDocument();
      expect(screen.getByText('AWS Certified')).toBeInTheDocument();
      expect(screen.getByText('Amazon')).toBeInTheDocument();
    });

    it('renders nothing for an empty list', () => {
      const { container } = render(
        <ListSectionRenderer sectionKey="awards" items={[]} theme={theme} />,
      );
      expect(container).toBeEmptyDOMElement();
    });
  });
});
