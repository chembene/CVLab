import { buildSearchableText, extractNames, sectionCount } from './ats-content.util';

describe('ats-content.util', () => {
  describe('buildSearchableText', () => {
    it('collects every string value anywhere in a nested content object, lowercased', () => {
      const text = buildSearchableText({
        summary: 'Experienced Backend Engineer',
        workExperiences: [{ company: 'Acme', achievements: ['Shipped Power BI dashboards'] }],
        skills: [{ name: 'TypeScript' }],
      });

      expect(text).toContain('experienced backend engineer');
      expect(text).toContain('acme');
      expect(text).toContain('power bi');
      expect(text).toContain('typescript');
    });

    it('ignores non-string values (numbers, booleans, null)', () => {
      const text = buildSearchableText({ yearsExperience: 5, active: true, note: null });
      expect(text).toBe('');
    });
  });

  describe('extractNames', () => {
    it('pulls the named field out of each object in an array', () => {
      expect(extractNames([{ name: 'TypeScript' }, { name: 'Go' }], 'name')).toEqual([
        'TypeScript',
        'Go',
      ]);
    });

    it('returns an empty array for non-array input', () => {
      expect(extractNames(undefined, 'name')).toEqual([]);
      expect(extractNames('not an array', 'name')).toEqual([]);
    });

    it('skips entries missing the field or with an empty value', () => {
      expect(extractNames([{ name: 'Go' }, { other: 'x' }, { name: '' }], 'name')).toEqual(['Go']);
    });
  });

  describe('sectionCount', () => {
    it('returns array length', () => {
      expect(sectionCount([1, 2, 3])).toBe(3);
    });

    it('returns 0 for non-array values', () => {
      expect(sectionCount(undefined)).toBe(0);
      expect(sectionCount(null)).toBe(0);
      expect(sectionCount('x')).toBe(0);
    });
  });
});
