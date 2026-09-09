import {
  buildEligibleFields,
  getFieldValue,
  validateCvImportAiSuggestions,
} from './cv-import-ai-validator';
import type { ExtractedCvData } from './interfaces/extracted-cv-data.interface';
import type { CvImportAiSuggestion } from './interfaces/cv-import-ai.interface';

const data: ExtractedCvData = {
  personalData: { fullName: 'Maria Sitoe', email: 'maria@example.com' },
  summary: 'Experienced engineer.',
  workExperiences: [
    { company: 'TechCorp', position: 'Engineer', startDate: '2020-01-01', currentlyWorking: true },
    { position: 'Untitled' },
  ],
  educations: [{ institution: 'UEM', degree: 'BSc' }],
  skills: [{ name: 'TypeScript' }],
  languages: [],
  certificates: [],
  projects: [],
  awards: [],
  volunteerExperiences: [],
  references: [],
};

describe('getFieldValue', () => {
  it('reads a personalData field', () => {
    expect(getFieldValue(data, 'personalData', undefined, 'fullName')).toBe('Maria Sitoe');
  });

  it('reads the summary field', () => {
    expect(getFieldValue(data, 'summary', undefined, 'summary')).toBe('Experienced engineer.');
  });

  it('reads an array-section field by index', () => {
    expect(getFieldValue(data, 'workExperiences', 0, 'company')).toBe('TechCorp');
  });

  it('returns undefined for a field that is empty/absent on that entry', () => {
    expect(getFieldValue(data, 'workExperiences', 1, 'company')).toBeUndefined();
  });

  it('returns undefined for an out-of-range index', () => {
    expect(getFieldValue(data, 'workExperiences', 5, 'company')).toBeUndefined();
  });

  it('returns undefined for a field name that does not belong to that section', () => {
    expect(getFieldValue(data, 'skills', 0, 'institution')).toBeUndefined();
  });

  it('returns undefined for an unrecognized personalData field', () => {
    expect(getFieldValue(data, 'personalData', undefined, 'notAField')).toBeUndefined();
  });
});

describe('buildEligibleFields', () => {
  it('includes every non-empty personalData/summary/array-entry field', () => {
    const fields = buildEligibleFields(data);
    expect(fields).toEqual(
      expect.arrayContaining([
        { section: 'personalData', field: 'fullName', originalValue: 'Maria Sitoe' },
        { section: 'personalData', field: 'email', originalValue: 'maria@example.com' },
        { section: 'summary', field: 'summary', originalValue: 'Experienced engineer.' },
        { section: 'workExperiences', index: 0, field: 'company', originalValue: 'TechCorp' },
        { section: 'workExperiences', index: 0, field: 'position', originalValue: 'Engineer' },
        { section: 'workExperiences', index: 1, field: 'position', originalValue: 'Untitled' },
        { section: 'educations', index: 0, field: 'institution', originalValue: 'UEM' },
        { section: 'skills', index: 0, field: 'name', originalValue: 'TypeScript' },
      ]),
    );
  });

  it('never includes a field with no value', () => {
    const fields = buildEligibleFields(data);
    expect(
      fields.some((f) => f.section === 'workExperiences' && f.index === 1 && f.field === 'company'),
    ).toBe(false);
  });

  it('returns an empty array for a fully empty draft', () => {
    const empty: ExtractedCvData = {
      personalData: {},
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
    expect(buildEligibleFields(empty)).toEqual([]);
  });
});

describe('validateCvImportAiSuggestions', () => {
  const valid: CvImportAiSuggestion = {
    section: 'workExperiences',
    index: 0,
    field: 'position',
    originalValue: 'whatever the AI echoed',
    suggestedValue: 'Software Engineer',
    reason: 'clean up',
    confidence: 0.8,
  };

  it('keeps a suggestion that targets a real, non-empty field', () => {
    const result = validateCvImportAiSuggestions(data, [valid]);
    expect(result).toHaveLength(1);
  });

  it('always substitutes the REAL current value as originalValue, never trusting the echoed one', () => {
    const [result] = validateCvImportAiSuggestions(data, [valid]);
    expect(result!.originalValue).toBe('Engineer');
  });

  it('drops a suggestion targeting an out-of-range index', () => {
    const result = validateCvImportAiSuggestions(data, [{ ...valid, index: 99 }]);
    expect(result).toEqual([]);
  });

  it('drops a suggestion targeting an empty field on a real entry', () => {
    const result = validateCvImportAiSuggestions(data, [{ ...valid, index: 1, field: 'company' }]);
    expect(result).toEqual([]);
  });

  it('drops a suggestion targeting an unrecognized section', () => {
    const result = validateCvImportAiSuggestions(data, [
      { ...valid, section: 'skills', field: 'institution' },
    ]);
    expect(result).toEqual([]);
  });

  it('keeps only the valid ones out of a mixed batch', () => {
    const result = validateCvImportAiSuggestions(data, [
      valid,
      { ...valid, index: 99 },
      { ...valid, section: 'skills', index: 0, field: 'name' },
    ]);
    expect(result).toHaveLength(2);
  });

  it('returns an empty array for an empty input', () => {
    expect(validateCvImportAiSuggestions(data, [])).toEqual([]);
  });
});
