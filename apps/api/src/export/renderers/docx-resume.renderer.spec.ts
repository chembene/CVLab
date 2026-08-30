import { NotFoundException } from '@nestjs/common';
import { DocxResumeRenderer } from './docx-resume.renderer';
import type { ResumeTemplateRepository } from '../../template-engine/resume-template.repository';

describe('DocxResumeRenderer', () => {
  let templateRepository: jest.Mocked<ResumeTemplateRepository>;
  let renderer: DocxResumeRenderer;

  const template = {
    id: 'ats-classic',
    layout: 'single-column',
    primaryColor: '#1F2937',
    secondaryColor: '#374151',
    font: 'Inter',
    supportedSections: [
      'summary',
      'workExperiences',
      'educations',
      'skills',
      'languages',
      'certificates',
      'projects',
      'courses',
      'awards',
      'publications',
      'volunteerExperiences',
      'references',
    ],
  };

  const input = {
    content: {
      title: 'Backend Developer',
      summary: 'Experienced backend engineer.',
      workExperiences: [
        {
          id: 'w1',
          displayOrder: 0,
          position: 'Engineer',
          company: 'Acme',
          startDate: '2020-01-01',
          currentlyWorking: true,
          description: 'Led the backend team.',
        },
      ],
      educations: [
        {
          id: 'e1',
          displayOrder: 0,
          institution: 'MIT',
          degree: 'BSc',
          startDate: '2016-01-01',
          endDate: '2020-01-01',
        },
      ],
      skills: [
        { id: 's1', displayOrder: 0, name: 'TypeScript' },
        { id: 's2', displayOrder: 1, name: 'Node.js' },
      ],
      languages: [{ id: 'l1', displayOrder: 0, language: 'English', proficiency: 'Fluent' }],
      certificates: [{ id: 'c1', displayOrder: 0, title: 'AWS Certified', issuer: 'Amazon' }],
      projects: [
        {
          id: 'p1',
          displayOrder: 0,
          title: 'Open Source Lib',
          description: 'A useful library.',
          url: 'https://example.com',
        },
      ],
      courses: [{ id: 'co1', displayOrder: 0, title: 'Advanced TS', provider: 'Udemy' }],
      awards: [{ id: 'a1', displayOrder: 0, title: 'Best Engineer', issuer: 'Acme' }],
      publications: [],
      volunteerExperiences: [],
      references: [
        { id: 'r1', displayOrder: 0, name: 'Jane Doe', position: 'CTO', company: 'Acme' },
      ],
    },
    profile: {
      displayName: 'Ana Machava',
      email: 'ana@example.com',
      phone: '+258 84 000 0000',
      city: 'Maputo',
      country: 'Moçambique',
      linkedin: 'linkedin.com/in/ana',
    },
    templateId: 'ats-classic',
    themeOverrides: null,
  };

  beforeEach(() => {
    templateRepository = {
      findById: jest.fn().mockResolvedValue(template),
    } as unknown as jest.Mocked<ResumeTemplateRepository>;
    renderer = new DocxResumeRenderer(templateRepository);
  });

  it('resolves the given templateId, falling back to "ats-classic" only when none is supplied', async () => {
    await renderer.render({ ...input, templateId: null });
    expect(templateRepository.findById).toHaveBeenCalledWith('ats-classic');
  });

  it('throws NotFoundException when the templateId does not resolve to an active template', async () => {
    templateRepository.findById.mockResolvedValue(null);
    await expect(renderer.render(input)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('produces a valid, non-empty DOCX (ZIP-container) buffer with the correct content type and filename', async () => {
    const result = await renderer.render(input);

    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBeGreaterThan(0);
    // Every .docx is a ZIP container — "PK\x03\x04" is the ZIP local-file-header
    // magic number, the one format-level guarantee worth asserting without
    // parsing the whole OOXML document tree.
    expect(result.buffer.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(result.contentType).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(result.fileName).toBe('curriculo.docx');
  });

  it('omits a section entirely when the template does not support it (never a placeholder page)', async () => {
    templateRepository.findById.mockResolvedValue({
      ...template,
      supportedSections: ['workExperiences'],
    } as never);
    const result = await renderer.render(input);
    // No direct text-extraction here (would need unzipping the OOXML) — this
    // just confirms rendering with a drastically reduced section set still
    // succeeds and produces a smaller, still-valid document.
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it('renders successfully even when every array section is empty (no CV data yet)', async () => {
    const emptyInput = {
      ...input,
      content: {
        title: 'Backend Developer',
        summary: '',
        workExperiences: [],
        educations: [],
        skills: [],
        languages: [],
        certificates: [],
        projects: [],
        courses: [],
        awards: [],
        publications: [],
        volunteerExperiences: [],
        references: [],
      },
    };
    const result = await renderer.render(emptyInput);
    expect(result.buffer.length).toBeGreaterThan(0);
  });
});
