import { computeSectionStatuses } from './section-status';
import type { ExtractedCvData } from '@/lib/api/cv-import';

function emptyData(): ExtractedCvData {
  return {
    personalData: {},
    summary: undefined,
    workExperiences: [],
    educations: [],
    skills: [],
    languages: [],
    certificates: [],
    projects: [],
    awards: [],
    volunteerExperiences: [],
    references: [],
  };
}

function statusOf(items: ReturnType<typeof computeSectionStatuses>, key: string) {
  return items.find((i) => i.key === key)?.status;
}

describe('computeSectionStatuses', () => {
  it('marks every section as "not_found" for a completely empty draft', () => {
    const items = computeSectionStatuses(emptyData(), {});
    expect(items.every((i) => i.status === 'not_found')).toBe(true);
    expect(items).toHaveLength(11);
  });

  it('never marks a section "found" just because the array exists — an empty array stays "not_found"', () => {
    const data = emptyData();
    data.workExperiences = [];
    const items = computeSectionStatuses(data, {});
    expect(statusOf(items, 'workExperiences')).toBe('not_found');
  });

  it('marks a section "found" when entries are confident and have no warnings', () => {
    const data = emptyData();
    data.skills = [
      { name: 'TypeScript', confidence: 0.6, source: 'document', warnings: [] },
      { name: 'Node.js', confidence: 0.6, source: 'document', warnings: [] },
    ];
    const items = computeSectionStatuses(data, {});
    expect(statusOf(items, 'skills')).toBe('found');
  });

  it('marks a section "needs_review" when any entry carries a warning', () => {
    const data = emptyData();
    data.workExperiences = [
      {
        company: 'Acme',
        position: 'Dev',
        startDate: '2020-01-01',
        confidence: 0.8,
        source: 'document',
        warnings: [],
      },
      {
        company: undefined,
        position: 'Analista',
        confidence: 0.5,
        source: 'document',
        warnings: ['Empresa não identificada.'],
      },
    ];
    const items = computeSectionStatuses(data, {});
    expect(statusOf(items, 'workExperiences')).toBe('needs_review');
  });

  it('marks a section "needs_review" when any entry came from the fallback recovery path', () => {
    const data = emptyData();
    data.workExperiences = [
      {
        company: 'Acme',
        position: 'Dev',
        confidence: 0.3,
        source: 'fallback',
        warnings: ['Recuperado automaticamente.'],
      },
    ];
    const items = computeSectionStatuses(data, {});
    expect(statusOf(items, 'workExperiences')).toBe('needs_review');
  });

  it('marks a section "partial" when confidence is mediocre but there are no explicit warnings', () => {
    const data = emptyData();
    data.projects = [{ title: 'Portfolio', confidence: 0.4, source: 'document', warnings: [] }];
    const items = computeSectionStatuses(data, {});
    expect(statusOf(items, 'projects')).toBe('partial');
  });

  it('personal info: "not_found" when no contact field was extracted at all', () => {
    const items = computeSectionStatuses(emptyData(), {});
    expect(statusOf(items, 'personalData')).toBe('not_found');
  });

  it('personal info: "found" when the core fields (name + email) are present with no low-confidence flag', () => {
    const data = emptyData();
    data.personalData = { fullName: 'Ana Machava', email: 'ana@example.com' };
    const items = computeSectionStatuses(data, {
      'personalData.fullName': 0.6,
      'personalData.email': 0.95,
    });
    expect(statusOf(items, 'personalData')).toBe('found');
  });

  it('personal info: "needs_review" when a core field has a low confidence score', () => {
    const data = emptyData();
    data.personalData = { fullName: 'Ana', email: 'ana@example.com' };
    const items = computeSectionStatuses(data, {
      'personalData.fullName': 0.3,
      'personalData.email': 0.95,
    });
    expect(statusOf(items, 'personalData')).toBe('needs_review');
  });

  it('personal info: "partial" when only a phone was found (no name/email)', () => {
    const data = emptyData();
    data.personalData = { phone: '+258821112233' };
    const items = computeSectionStatuses(data, {});
    expect(statusOf(items, 'personalData')).toBe('partial');
  });

  it('summary: "not_found" for an empty/whitespace-only summary', () => {
    const data = emptyData();
    data.summary = '   ';
    const items = computeSectionStatuses(data, {});
    expect(statusOf(items, 'summary')).toBe('not_found');
  });

  it('summary: "found" for a present summary with no low-confidence flag', () => {
    const data = emptyData();
    data.summary = 'Engenheira de software.';
    const items = computeSectionStatuses(data, { summary: 0.55 });
    expect(statusOf(items, 'summary')).toBe('found');
  });
});
