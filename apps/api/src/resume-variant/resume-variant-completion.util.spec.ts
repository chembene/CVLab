import { calculateVariantCompletion } from './resume-variant-completion.util';

describe('calculateVariantCompletion', () => {
  it('returns 0 when nothing is present', () => {
    expect(calculateVariantCompletion(undefined, {})).toBe(0);
  });

  it('returns 100 when every check passes', () => {
    const percentage = calculateVariantCompletion('Backend Engineer', {
      summary: 'Experienced engineer',
      workExperiences: [{ company: 'Acme' }],
      educations: [{ institution: 'MIT' }],
      skills: [{ name: 'TypeScript' }],
      languages: [{ language: 'English' }],
    });
    expect(percentage).toBe(100);
  });

  it('ignores empty arrays (counts them as not-present)', () => {
    const percentage = calculateVariantCompletion('Title only', {
      workExperiences: [],
      educations: [],
      skills: [],
      languages: [],
    });
    // Only "title" passes out of 6 checks -> round(1/6*100) = 17
    expect(percentage).toBe(17);
  });

  it('is unaffected by fields a Variant snapshot never carries (e.g. profile/photo)', () => {
    const percentage = calculateVariantCompletion('Title', {
      linkedin: 'https://linkedin.com/in/x',
      photoUrl: 'https://example.com/p.jpg',
    });
    // Only "title" passes — unknown keys are simply ignored, not counted.
    expect(percentage).toBe(17);
  });
});
