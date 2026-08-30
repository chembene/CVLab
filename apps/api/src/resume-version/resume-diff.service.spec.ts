import { ResumeDiffService } from './resume-diff.service';

describe('ResumeDiffService', () => {
  const service = new ResumeDiffService();

  it('marks a scalar field unchanged when equal, changed when different, and added/removed when it appears/disappears', () => {
    const diff = service.compare(
      1,
      2,
      { summary: 'old', title: undefined },
      { summary: 'new', title: 'Engineer' },
    );

    const summarySection = diff.sections.find((s) => s.section === 'summary');
    expect(summarySection?.status).toBe('changed');

    const titleSection = diff.sections.find((s) => s.section === 'title');
    expect(titleSection?.status).toBe('added');
  });

  it('marks a scalar field removed when it goes from present to absent', () => {
    const diff = service.compare(1, 2, { currency: 'MZN' }, { currency: undefined });
    const currencySection = diff.sections.find((s) => s.section === 'currency');
    expect(currencySection?.status).toBe('removed');
  });

  it('treats an unchanged array item (identical content) as unchanged even if it moved position', () => {
    const before = { skills: [{ name: 'TypeScript' }, { name: 'NestJS' }] };
    const after = { skills: [{ name: 'NestJS' }, { name: 'TypeScript' }] };

    const diff = service.compare(1, 2, before, after);
    const skillsSection = diff.sections.find((s) => s.section === 'skills');
    expect(skillsSection?.fields.every((f) => f.status === 'unchanged')).toBe(true);
    expect(skillsSection?.status).toBe('unchanged');
  });

  it('detects an added array item', () => {
    const before = { skills: [{ name: 'TypeScript' }] };
    const after = { skills: [{ name: 'TypeScript' }, { name: 'React' }] };

    const diff = service.compare(1, 2, before, after);
    const skillsSection = diff.sections.find((s) => s.section === 'skills');
    expect(skillsSection?.status).toBe('added');
    expect(
      skillsSection?.fields.some(
        (f) => f.status === 'added' && (f.after as { name: string }).name === 'React',
      ),
    ).toBe(true);
  });

  it('detects a removed array item', () => {
    const before = { skills: [{ name: 'TypeScript' }, { name: 'React' }] };
    const after = { skills: [{ name: 'TypeScript' }] };

    const diff = service.compare(1, 2, before, after);
    const skillsSection = diff.sections.find((s) => s.section === 'skills');
    expect(skillsSection?.status).toBe('removed');
  });

  it('pairs positionally-remaining items as changed when neither an exact match nor a pure add/remove', () => {
    const before = { workExperiences: [{ company: 'Acme', title: 'Engineer' }] };
    const after = { workExperiences: [{ company: 'Acme', title: 'Senior Engineer' }] };

    const diff = service.compare(1, 2, before, after);
    const section = diff.sections.find((s) => s.section === 'workExperiences');
    expect(section?.status).toBe('changed');
    expect(section?.fields[0]?.status).toBe('changed');
  });

  it('treats a non-array value at an array key as an empty array rather than throwing', () => {
    const diff = service.compare(
      1,
      2,
      { educations: null as unknown as unknown[] },
      { educations: [{ school: 'X' }] },
    );
    const section = diff.sections.find((s) => s.section === 'educations');
    expect(section?.status).toBe('added');
  });

  it('aggregates a summary count across all sections', () => {
    const before = { summary: 'old', skills: [{ name: 'A' }] };
    const after = { summary: 'new', skills: [{ name: 'A' }, { name: 'B' }] };

    const diff = service.compare(3, 4, before, after);
    expect(diff.fromVersion).toBe(3);
    expect(diff.toVersion).toBe(4);
    expect(diff.summary.changed).toBeGreaterThanOrEqual(1);
    expect(diff.summary.added).toBeGreaterThanOrEqual(1);
  });

  it('reports every section unchanged for two identical snapshots', () => {
    const content = { summary: 'same', skills: [{ name: 'TypeScript' }] };
    const diff = service.compare(1, 1, content, content);
    expect(diff.sections.every((s) => s.status === 'unchanged')).toBe(true);
    expect(diff.summary.added).toBe(0);
    expect(diff.summary.removed).toBe(0);
    expect(diff.summary.changed).toBe(0);
  });
});
