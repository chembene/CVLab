import { splitJobSections } from './job-section-splitter.util';

describe('splitJobSections', () => {
  const text = [
    'About the role',
    'We are looking for a great engineer.',
    '',
    'Responsibilities',
    'Build features',
    'Review code',
    '',
    'Requirements',
    '5+ years of experience',
    'Strong TypeScript skills',
    '',
    'Nice to have',
    'Experience with Kubernetes',
    '',
    'Benefits',
    'Health insurance',
    'Remote work',
  ].join('\n');

  it('splits the description into labeled sections by header keyword', () => {
    const sections = splitJobSections(text);
    expect(sections.responsibilities).toEqual(['Build features', 'Review code']);
    expect(sections.requirements).toEqual(['5+ years of experience', 'Strong TypeScript skills']);
    expect(sections.niceToHave).toEqual(['Experience with Kubernetes']);
    expect(sections.benefits).toEqual(['Health insurance', 'Remote work']);
  });

  it('returns empty arrays when no recognizable headers are present', () => {
    const sections = splitJobSections('Just a single unstructured paragraph with no headers.');
    expect(sections).toEqual({
      responsibilities: [],
      requirements: [],
      niceToHave: [],
      benefits: [],
    });
  });

  it('strips leading bullet characters from section lines', () => {
    const bulleted = 'Responsibilities\n- Build features\n• Review code';
    expect(splitJobSections(bulleted).responsibilities).toEqual(['Build features', 'Review code']);
  });
});
