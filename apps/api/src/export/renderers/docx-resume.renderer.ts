import { Injectable, NotFoundException } from '@nestjs/common';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { SECTION_CONFIGS, formatDate, type SectionItem } from '@cvlab/resume-renderer';
import { ResumeTemplateRepository } from '../../template-engine/resume-template.repository';
import type {
  ResumeRenderer,
  ResumeRenderInput,
  ResumeRenderResult,
} from '../interfaces/resume-render-input.interface';

/** Mirrors PdfResumeRenderer's own fallback — see that file for the rationale. */
const DEFAULT_RESUME_TEMPLATE_ID = 'ats-classic';

function asItems(value: unknown): SectionItem[] {
  return Array.isArray(value) ? (value as SectionItem[]) : [];
}

function str(item: Record<string, unknown>, key: string): string {
  const value = item[key];
  return typeof value === 'string' ? value : '';
}

/** docx's `color`/`highlight` options expect a bare 6-hex-digit string, never a leading "#" (unlike every CSS hex color elsewhere in this codebase). */
function hexNoHash(color: string): string {
  return color.startsWith('#') ? color.slice(1) : color;
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

/**
 * DOCX Rendering — a genuinely separate serializer from the PDF pipeline
 * (docx's document model has nothing in common with HTML/React), built with
 * the `docx` library directly (no HTML→DOCX conversion, no PDF→DOCX
 * conversion — see docs/architecture/export-engine.md "DOCX Rendering").
 * Reuses `SECTION_CONFIGS`/`formatDate` from `@cvlab/resume-renderer` for
 * the exact same title/subtitle/date formatting the PDF/live-preview
 * renderers use, so the two outputs stay semantically aligned even though
 * their document models are unrelated. Not pixel-perfect vs. the PDF by
 * design (the brief's own explicit "não é necessário garantir pixel-perfect
 * equivalence") — valid, professional, opens cleanly in Word/LibreOffice.
 */
@Injectable()
export class DocxResumeRenderer implements ResumeRenderer {
  constructor(private readonly templateRepository: ResumeTemplateRepository) {}

  async render(input: ResumeRenderInput): Promise<ResumeRenderResult> {
    const template = await this.resolveTemplate(input.templateId);
    const accentColor = hexNoHash(template.primaryColor);
    const content = input.content;
    const supported = new Set(template.supportedSections);
    const supports = (key: string) => supported.has(key);

    const children: Paragraph[] = [
      ...this.renderHeader(input, accentColor),
      ...(supports('summary') ? this.renderSummary(content.summary, accentColor) : []),
      ...(supports('workExperiences')
        ? this.renderWorkExperiences(content.workExperiences, accentColor)
        : []),
      ...(supports('educations') ? this.renderEducations(content.educations, accentColor) : []),
      ...(supports('skills') ? this.renderSkills(content.skills, accentColor) : []),
      ...(supports('languages') ? this.renderLanguages(content.languages, accentColor) : []),
      ...(supports('certificates')
        ? this.renderCertificates(content.certificates, accentColor)
        : []),
      ...(supports('projects') ? this.renderProjects(content.projects, accentColor) : []),
      ...(supports('courses')
        ? this.renderGenericList('Cursos', content.courses, accentColor)
        : []),
      ...(supports('awards') ? this.renderGenericList('Prémios', content.awards, accentColor) : []),
      ...(supports('publications')
        ? this.renderGenericList('Publicações', content.publications, accentColor)
        : []),
      ...(supports('volunteerExperiences')
        ? this.renderGenericList('Voluntariado', content.volunteerExperiences, accentColor)
        : []),
      ...(supports('references') ? this.renderReferences(content.references, accentColor) : []),
    ];

    const document = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(document);
    return {
      buffer,
      fileName: 'curriculo.docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  private async resolveTemplate(
    templateId: string | null,
  ): Promise<{ primaryColor: string; supportedSections: string[] }> {
    const id = templateId ?? DEFAULT_RESUME_TEMPLATE_ID;
    const template = await this.templateRepository.findById(id);
    if (!template) {
      throw new NotFoundException(`Resume template "${id}" not found.`);
    }
    return template;
  }

  private renderHeader(input: ResumeRenderInput, accentColor: string): Paragraph[] {
    const profile = input.profile;
    const name =
      profile?.displayName ||
      [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') ||
      'Nome do candidato';
    const title = typeof input.content.title === 'string' ? input.content.title : undefined;
    const contactParts = [
      profile?.email,
      profile?.phone,
      [profile?.city, profile?.country].filter(Boolean).join(', ') || undefined,
      profile?.linkedin,
      profile?.github,
      profile?.website || profile?.portfolio || undefined,
    ].filter((part): part is string => Boolean(part));

    const paragraphs: Paragraph[] = [new Paragraph({ text: name, heading: HeadingLevel.TITLE })];
    if (title || profile?.headline) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: title || profile!.headline!, color: accentColor })],
        }),
      );
    }
    if (contactParts.length > 0) {
      paragraphs.push(new Paragraph({ text: contactParts.join(' · '), spacing: { after: 200 } }));
    }
    return paragraphs;
  }

  private sectionHeading(title: string, accentColor: string): Paragraph {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 100 },
      children: [new TextRun({ text: title, bold: true, color: accentColor })],
    });
  }

  private renderSummary(summary: unknown, accentColor: string): Paragraph[] {
    if (typeof summary !== 'string' || !summary) return [];
    return [
      this.sectionHeading('Resumo Profissional', accentColor),
      new Paragraph({ text: summary }),
    ];
  }

  private renderWorkExperiences(items: unknown, accentColor: string): Paragraph[] {
    const list = asItems(items);
    if (list.length === 0) return [];
    const config = SECTION_CONFIGS['work-experience'];
    const paragraphs = [this.sectionHeading('Experiência Profissional', accentColor)];
    for (const item of list) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: config.title(item), bold: true })] }),
      );
      const subtitle = config.subtitle(item);
      const dates = dateRange(item, 'currentlyWorking');
      if (subtitle || dates) {
        paragraphs.push(new Paragraph({ text: [subtitle, dates].filter(Boolean).join(' · ') }));
      }
      const description = str(item, 'description');
      if (description) {
        paragraphs.push(new Paragraph({ text: description, spacing: { after: 120 } }));
      }
    }
    return paragraphs;
  }

  private renderEducations(items: unknown, accentColor: string): Paragraph[] {
    const list = asItems(items);
    if (list.length === 0) return [];
    const config = SECTION_CONFIGS.education;
    const paragraphs = [this.sectionHeading('Formação Académica', accentColor)];
    for (const item of list) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: config.title(item), bold: true })] }),
      );
      const subtitle = config.subtitle(item);
      const dates = dateRange(item);
      if (subtitle || dates) {
        paragraphs.push(
          new Paragraph({
            text: [subtitle, dates].filter(Boolean).join(' · '),
            spacing: { after: 120 },
          }),
        );
      }
    }
    return paragraphs;
  }

  private renderSkills(items: unknown, accentColor: string): Paragraph[] {
    const list = asItems(items);
    if (list.length === 0) return [];
    const names = list.map((item) => str(item, 'name')).filter(Boolean);
    if (names.length === 0) return [];
    return [
      this.sectionHeading('Competências', accentColor),
      new Paragraph({ text: names.join(', ') }),
    ];
  }

  private renderLanguages(items: unknown, accentColor: string): Paragraph[] {
    const list = asItems(items);
    if (list.length === 0) return [];
    const paragraphs = [this.sectionHeading('Idiomas', accentColor)];
    for (const item of list) {
      const language = str(item, 'language');
      const proficiency = str(item, 'proficiency');
      paragraphs.push(new Paragraph({ text: [language, proficiency].filter(Boolean).join(' — ') }));
    }
    return paragraphs;
  }

  private renderCertificates(items: unknown, accentColor: string): Paragraph[] {
    const list = asItems(items);
    if (list.length === 0) return [];
    const config = SECTION_CONFIGS.certificates;
    const paragraphs = [this.sectionHeading('Certificados', accentColor)];
    for (const item of list) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: config.title(item), bold: true })] }),
      );
      const subtitle = config.subtitle(item);
      if (subtitle) {
        paragraphs.push(new Paragraph({ text: subtitle, spacing: { after: 120 } }));
      }
    }
    return paragraphs;
  }

  private renderProjects(items: unknown, accentColor: string): Paragraph[] {
    const list = asItems(items);
    if (list.length === 0) return [];
    const paragraphs = [this.sectionHeading('Projetos', accentColor)];
    for (const item of list) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: str(item, 'title'), bold: true })] }),
      );
      const description = str(item, 'description');
      if (description) paragraphs.push(new Paragraph({ text: description }));
      const url = str(item, 'url');
      if (url) paragraphs.push(new Paragraph({ text: url, spacing: { after: 120 } }));
    }
    return paragraphs;
  }

  private renderReferences(items: unknown, accentColor: string): Paragraph[] {
    const list = asItems(items);
    if (list.length === 0) return [];
    const paragraphs = [this.sectionHeading('Referências', accentColor)];
    for (const item of list) {
      paragraphs.push(
        new Paragraph({ children: [new TextRun({ text: str(item, 'name'), bold: true })] }),
      );
      const subtitle = [str(item, 'position'), str(item, 'company')].filter(Boolean).join(' · ');
      if (subtitle) paragraphs.push(new Paragraph({ text: subtitle, spacing: { after: 120 } }));
    }
    return paragraphs;
  }

  /** Courses / Awards / Publications / Volunteer Experiences — the 4 array sections not individually named in the brief's renderer list, same as ListSectionRenderer in @cvlab/resume-renderer. */
  private renderGenericList(title: string, items: unknown, accentColor: string): Paragraph[] {
    const list = asItems(items);
    if (list.length === 0) return [];
    const paragraphs = [this.sectionHeading(title, accentColor)];
    for (const item of list) {
      const itemTitle = str(item, 'title') || str(item, 'organization');
      paragraphs.push(new Paragraph({ children: [new TextRun({ text: itemTitle, bold: true })] }));
      const subtitle = [
        str(item, 'issuer'),
        str(item, 'provider'),
        str(item, 'publisher'),
        str(item, 'role'),
      ]
        .filter(Boolean)
        .join(' · ');
      if (subtitle) paragraphs.push(new Paragraph({ text: subtitle, spacing: { after: 120 } }));
    }
    return paragraphs;
  }
}
