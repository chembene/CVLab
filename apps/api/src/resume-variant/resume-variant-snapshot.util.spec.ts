import { SECTION_DEFINITIONS, type SectionType } from '../resume-sections/section-registry';
import { SECTION_TYPE_TO_CONTENT_KEY, toSnapshotSection } from './resume-variant-snapshot.util';

describe('resume-variant-snapshot.util', () => {
  it('maps every SectionType from the registry to a content key', () => {
    const sectionTypes = Object.keys(SECTION_DEFINITIONS) as SectionType[];
    for (const type of sectionTypes) {
      expect(SECTION_TYPE_TO_CONTENT_KEY[type]).toEqual(expect.any(String));
    }
  });

  it('toSnapshotSection strips DB/identity metadata but keeps content fields', () => {
    const record = {
      id: 'we-1',
      resumeId: 'resume-1',
      displayOrder: 0,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
      company: 'Acme',
      position: 'Engineer',
    };

    const snapshot = toSnapshotSection(record);

    expect(snapshot).toEqual({ displayOrder: 0, company: 'Acme', position: 'Engineer' });
    expect(snapshot).not.toHaveProperty('id');
    expect(snapshot).not.toHaveProperty('resumeId');
    expect(snapshot).not.toHaveProperty('createdAt');
    expect(snapshot).not.toHaveProperty('updatedAt');
    expect(snapshot).not.toHaveProperty('deletedAt');
  });
});
