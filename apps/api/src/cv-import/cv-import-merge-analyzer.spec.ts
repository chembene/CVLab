import { analyzeMerge, type ExistingSections } from './cv-import-merge-analyzer';
import type { ExtractedCvData } from './interfaces/extracted-cv-data.interface';

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

function emptyExisting(): ExistingSections {
  return {
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

describe('analyzeMerge', () => {
  it('flags an exact (case/whitespace-insensitive) company+position match as a possible duplicate', () => {
    const data = emptyData();
    data.workExperiences = [{ company: '  ACME   Corp  ', position: 'gestora de projeto' }];
    const existing = emptyExisting();
    existing.workExperiences = [{ company: 'Acme Corp', position: 'Gestora de Projeto' }];

    const result = analyzeMerge(data, existing);

    expect(result.workExperiences).toEqual([
      {
        entry: data.workExperiences[0],
        status: 'possible_duplicate',
        existingId: undefined,
        existing: {
          company: 'Acme Corp',
          position: 'Gestora de Projeto',
          location: undefined,
          startDate: undefined,
          endDate: undefined,
          currentlyWorking: undefined,
          description: undefined,
        },
      },
    ]);
    expect(result.duplicateCount).toBe(1);
    expect(result.newCount).toBe(0);
  });

  it('treats the same company with a different position as new, not a duplicate', () => {
    const data = emptyData();
    data.workExperiences = [{ company: 'Acme Corp', position: 'Analista Senior' }];
    const existing = emptyExisting();
    existing.workExperiences = [{ company: 'Acme Corp', position: 'Gestora de Projeto' }];

    const result = analyzeMerge(data, existing);

    expect(result.workExperiences).toEqual([{ entry: data.workExperiences[0], status: 'new' }]);
    expect(result.newCount).toBe(1);
    expect(result.duplicateCount).toBe(0);
  });

  it('classifies skills by normalized name only', () => {
    const data = emptyData();
    data.skills = [{ name: 'TypeScript' }, { name: 'Rust' }];
    const existing = emptyExisting();
    existing.skills = [{ name: 'typescript' }];

    const result = analyzeMerge(data, existing);

    expect(result.skills).toEqual([
      {
        entry: { name: 'TypeScript' },
        status: 'possible_duplicate',
        existingId: undefined,
        existing: { name: 'typescript' },
      },
      { entry: { name: 'Rust' }, status: 'new' },
    ]);
  });

  it('never false-positives on an empty extracted CV against a populated existing resume', () => {
    const existing = emptyExisting();
    existing.workExperiences = [{ company: 'Acme', position: 'Dev' }];
    existing.skills = [{ name: 'TypeScript' }];

    const result = analyzeMerge(emptyData(), existing);

    expect(result.newCount).toBe(0);
    expect(result.duplicateCount).toBe(0);
  });

  it('computes newCount/duplicateCount across every section type combined', () => {
    const data = emptyData();
    data.educations = [{ institution: 'UEM', degree: 'Informatica' }];
    data.certificates = [{ title: 'AWS', issuer: 'Amazon' }];
    const existing = emptyExisting();
    existing.educations = [{ institution: 'UEM', degree: 'Informatica' }];
    // No existing certificate — should count as new.

    const result = analyzeMerge(data, existing);

    expect(result.educations[0]?.status).toBe('possible_duplicate');
    expect(result.certificates[0]?.status).toBe('new');
    expect(result.duplicateCount).toBe(1);
    expect(result.newCount).toBe(1);
  });

  describe('FASE 7 audit — existingId/existing projection for the "Existente vs Importado" diff', () => {
    it('does not set existingId/existing on a "new" entry', () => {
      const data = emptyData();
      data.skills = [{ name: 'Rust' }];
      const result = analyzeMerge(data, emptyExisting());

      expect(result.skills[0]?.existingId).toBeUndefined();
      expect(result.skills[0]?.existing).toBeUndefined();
    });

    it('projects the matched existing row (including its id) for a work-experience possible duplicate', () => {
      const data = emptyData();
      data.workExperiences = [
        { company: 'Acme Corp', position: 'Gestora de Projeto', description: 'Versão importada.' },
      ];
      const existing = emptyExisting();
      existing.workExperiences = [
        {
          id: 'wx-1',
          company: 'Acme Corp',
          position: 'Gestora de Projeto',
          location: 'Maputo',
          startDate: new Date('2019-03-01T00:00:00Z'),
          endDate: null,
          currentlyWorking: true,
          description: 'Versão existente.',
        },
      ];

      const result = analyzeMerge(data, existing);

      expect(result.workExperiences[0]?.existingId).toBe('wx-1');
      expect(result.workExperiences[0]?.existing).toEqual({
        company: 'Acme Corp',
        position: 'Gestora de Projeto',
        location: 'Maputo',
        startDate: '2019-03-01',
        endDate: undefined,
        currentlyWorking: true,
        description: 'Versão existente.',
      });
    });

    it('formats a Date-typed DB field as a plain "YYYY-MM-DD" string, matching the extracted-data date shape', () => {
      const data = emptyData();
      data.certificates = [{ title: 'AWS Certified', issuer: 'Amazon' }];
      const existing = emptyExisting();
      existing.certificates = [
        {
          id: 'cert-1',
          title: 'AWS Certified',
          issuer: 'Amazon',
          issueDate: new Date('2021-06-15T00:00:00Z'),
        },
      ];

      const result = analyzeMerge(data, existing);

      expect(result.certificates[0]?.existing?.issueDate).toBe('2021-06-15');
    });
  });
});
