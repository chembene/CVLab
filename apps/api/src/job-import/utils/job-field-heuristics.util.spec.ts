import {
  deriveCompanyFromFirstPathSegment,
  deriveCompanyFromWorkdaySubdomain,
  detectLanguages,
  detectSkills,
  detectTechnologies,
  normalizeEmploymentType,
  normalizeSalaryUnitText,
  normalizeSeniority,
  parseEducationLevel,
  parseExperienceYears,
  parseSalaryFromText,
} from './job-field-heuristics.util';

describe('job-field-heuristics.util', () => {
  describe('normalizeEmploymentType', () => {
    it('maps schema.org employmentType enum values into the fixed 9-value set', () => {
      expect(normalizeEmploymentType('FULL_TIME', '')).toBe('Full Time');
      expect(normalizeEmploymentType('part-time', '')).toBe('Part Time');
      expect(normalizeEmploymentType('CONTRACTOR', '')).toBe('Contract');
      expect(normalizeEmploymentType('INTERN', '')).toBe('Internship');
    });

    it('falls back to Remote/Hybrid/On-site/Freelance text scanning when the schema value is absent', () => {
      expect(normalizeEmploymentType(undefined, 'This is a fully remote position.')).toBe('Remote');
      expect(normalizeEmploymentType(undefined, 'Hybrid work model, 3 days in office.')).toBe(
        'Hybrid',
      );
      expect(normalizeEmploymentType(undefined, 'This is an on-site role.')).toBe('On-site');
      expect(normalizeEmploymentType(undefined, 'Open to freelancers.')).toBe('Freelance');
    });

    it('treats an explicit REMOTE schema signal as Remote', () => {
      expect(normalizeEmploymentType('REMOTE', '')).toBe('Remote');
    });

    it('returns undefined when nothing matches', () => {
      expect(normalizeEmploymentType('nonsense', 'no signal here')).toBeUndefined();
    });
  });

  describe('normalizeSeniority', () => {
    it('detects each level of the fixed 9-value set', () => {
      expect(normalizeSeniority('Senior Backend Engineer')).toBe('Senior');
      expect(normalizeSeniority('Junior Developer')).toBe('Junior');
      expect(normalizeSeniority('Engineering Manager')).toBe('Manager');
      expect(normalizeSeniority('Engineering Director')).toBe('Director');
      expect(normalizeSeniority('Chief Technology Officer')).toBe('Executive');
      expect(normalizeSeniority('Mid-level Engineer')).toBe('Mid');
      expect(normalizeSeniority('Summer Internship')).toBe('Intern');
      expect(normalizeSeniority('Principal Engineer')).toBe('Principal');
      expect(normalizeSeniority('Tech Lead')).toBe('Lead');
    });

    it('returns undefined when no seniority keyword is present', () => {
      expect(normalizeSeniority('Backend Engineer')).toBeUndefined();
    });

    it('resolves a combined title to its highest seniority', () => {
      expect(normalizeSeniority('Senior Engineering Manager')).toBe('Manager');
    });
  });

  describe('detectSkills / detectTechnologies', () => {
    it('splits detected keywords into disjoint skills vs technologies lists', () => {
      const text = 'We use TypeScript, NestJS, React, Docker, PostgreSQL and Git daily.';
      const skills = detectSkills(text);
      const technologies = detectTechnologies(text);

      expect(skills).toEqual(expect.arrayContaining(['TypeScript', 'NestJS', 'React', 'Git']));
      expect(technologies).toEqual(expect.arrayContaining(['Docker', 'PostgreSQL']));
      expect(skills.some((s) => technologies.includes(s))).toBe(false);
    });

    it('does not match unrelated words', () => {
      expect(detectSkills('We value clear thinking.')).not.toContain('Go');
    });
  });

  describe('detectLanguages', () => {
    it('detects required languages mentioned in text', () => {
      expect(detectLanguages('Fluency in English and Portuguese required.')).toEqual(
        expect.arrayContaining(['English', 'Portuguese']),
      );
    });
  });

  describe('parseSalaryFromText', () => {
    it('parses a salary range with currency symbol and period', () => {
      const salary = parseSalaryFromText('Compensation: $80,000 - $100,000 per year');
      expect(salary?.min).toBe(80000);
      expect(salary?.max).toBe(100000);
      expect(salary?.currency).toBe('USD');
      expect(salary?.period).toBe('YEARLY');
    });

    it('detects a monthly period', () => {
      const salary = parseSalaryFromText('MT 50,000 - 70,000 per month');
      expect(salary?.period).toBe('MONTHLY');
      expect(salary?.currency).toBe('MZN');
    });

    it('returns undefined for text with no salary mention', () => {
      expect(parseSalaryFromText('No salary information here.')).toBeUndefined();
    });
  });

  describe('normalizeSalaryUnitText', () => {
    it('maps schema.org unitText values', () => {
      expect(normalizeSalaryUnitText('YEAR')).toBe('YEARLY');
      expect(normalizeSalaryUnitText('MONTH')).toBe('MONTHLY');
      expect(normalizeSalaryUnitText('HOUR')).toBe('HOURLY');
      expect(normalizeSalaryUnitText('WEEK')).toBe('WEEKLY');
      expect(normalizeSalaryUnitText(undefined)).toBeUndefined();
    });
  });

  describe('parseExperienceYears', () => {
    it('parses a year range into min/preferred', () => {
      expect(parseExperienceYears('3-5 years of experience required')).toEqual({
        minYears: 3,
        preferredYears: 5,
      });
    });

    it('parses a "N+ years" figure into minYears only', () => {
      expect(parseExperienceYears('5+ years of experience')).toEqual({ minYears: 5 });
    });

    it('parses "at least N years"', () => {
      expect(parseExperienceYears('at least 2 years of experience')).toEqual({ minYears: 2 });
    });

    it('returns undefined when no experience figure is present', () => {
      expect(parseExperienceYears('Experience with TypeScript required.')).toBeUndefined();
    });
  });

  describe('parseEducationLevel', () => {
    it('detects each education level', () => {
      expect(parseEducationLevel("Bachelor's degree required")).toBe('Bachelor');
      expect(parseEducationLevel("Master's degree preferred")).toBe('Master');
      expect(parseEducationLevel('PhD in Computer Science')).toBe('PhD');
      expect(parseEducationLevel('High school diploma')).toBe('High School');
    });

    it('returns the highest level when multiple are mentioned', () => {
      expect(parseEducationLevel("Bachelor's or Master's degree")).toBe('Master');
    });

    it('returns undefined when no education level is mentioned', () => {
      expect(parseEducationLevel('5 years of experience required')).toBeUndefined();
    });
  });

  describe('deriveCompanyFromFirstPathSegment / deriveCompanyFromWorkdaySubdomain', () => {
    it('derives a company name from a Greenhouse/Lever-style URL path', () => {
      expect(
        deriveCompanyFromFirstPathSegment('https://boards.greenhouse.io/acme-corp/jobs/123'),
      ).toBe('Acme Corp');
    });

    it('derives a company name from a Workday tenant subdomain', () => {
      expect(
        deriveCompanyFromWorkdaySubdomain(
          'https://acme-corp.wd1.myworkdayjobs.com/en-US/careers/job/123',
        ),
      ).toBe('Acme Corp');
    });

    it('returns undefined for a non-Workday hostname', () => {
      expect(deriveCompanyFromWorkdaySubdomain('https://example.com/jobs/1')).toBeUndefined();
    });
  });
});
