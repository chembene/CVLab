import { seedExistingSectionIds } from './merge-seed';
import type { ExtractedCvData, MergePreview } from '@/lib/api/cv-import';

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

function emptyPreview(): MergePreview {
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
    newCount: 0,
    duplicateCount: 0,
  };
}

describe('seedExistingSectionIds', () => {
  it('copies existingId onto the matching (same-index) entry when flagged as a possible duplicate', () => {
    const data = emptyData();
    data.skills = [{ name: 'TypeScript' }, { name: 'Rust' }];
    const preview = emptyPreview();
    preview.skills = [
      {
        entry: { name: 'TypeScript' },
        status: 'possible_duplicate',
        existingId: 'skill-1',
        existing: { name: 'typescript' },
      },
      { entry: { name: 'Rust' }, status: 'new' },
    ];

    const seeded = seedExistingSectionIds(data, preview);

    expect(seeded.skills[0]?.existingSectionId).toBe('skill-1');
    expect(seeded.skills[1]?.existingSectionId).toBeUndefined();
  });

  it('is idempotent — never overwrites an existingSectionId already present', () => {
    const data = emptyData();
    data.skills = [{ name: 'TypeScript', existingSectionId: 'already-set' }];
    const preview = emptyPreview();
    preview.skills = [
      {
        entry: { name: 'TypeScript' },
        status: 'possible_duplicate',
        existingId: 'skill-1',
        existing: { name: 'typescript' },
      },
    ];

    const seeded = seedExistingSectionIds(data, preview);

    expect(seeded.skills[0]?.existingSectionId).toBe('already-set');
  });

  it('leaves every field untouched for a section with no preview data at all', () => {
    const data = emptyData();
    data.workExperiences = [{ company: 'Acme', position: 'Dev' }];
    const seeded = seedExistingSectionIds(data, emptyPreview());

    expect(seeded.workExperiences).toEqual([{ company: 'Acme', position: 'Dev' }]);
  });

  it('does not mutate the original data object', () => {
    const data = emptyData();
    data.skills = [{ name: 'TypeScript' }];
    const preview = emptyPreview();
    preview.skills = [
      {
        entry: { name: 'TypeScript' },
        status: 'possible_duplicate',
        existingId: 'skill-1',
        existing: { name: 'typescript' },
      },
    ];

    seedExistingSectionIds(data, preview);

    expect(data.skills[0]?.existingSectionId).toBeUndefined();
  });
});
