import { applyCvImportAiSuggestion } from './apply-ai-suggestion';
import type { CvImportAiSuggestion, ExtractedCvData } from '@/lib/api/cv-import';

const data: ExtractedCvData = {
  personalData: { fullName: 'maria sitoe' },
  summary: 'old summary',
  workExperiences: [{ company: 'TechCorp', position: 'Engineer' }],
  educations: [],
  skills: [],
  languages: [],
  certificates: [],
  projects: [],
  awards: [],
  volunteerExperiences: [],
  references: [],
};

function suggestion(overrides: Partial<CvImportAiSuggestion> = {}): CvImportAiSuggestion {
  return {
    section: 'workExperiences',
    index: 0,
    field: 'position',
    originalValue: 'Engineer',
    suggestedValue: 'Software Engineer',
    reason: 'r',
    confidence: 0.8,
    ...overrides,
  };
}

describe('applyCvImportAiSuggestion', () => {
  it('updates a personalData field', () => {
    const result = applyCvImportAiSuggestion(
      data,
      suggestion({
        section: 'personalData',
        index: undefined,
        field: 'fullName',
        suggestedValue: 'Maria Sitoe',
      }),
    );
    expect(result.personalData.fullName).toBe('Maria Sitoe');
  });

  it('updates the summary field', () => {
    const result = applyCvImportAiSuggestion(
      data,
      suggestion({
        section: 'summary',
        index: undefined,
        field: 'summary',
        suggestedValue: 'new summary',
      }),
    );
    expect(result.summary).toBe('new summary');
  });

  it('updates one field of one array-section entry, leaving the rest untouched', () => {
    const result = applyCvImportAiSuggestion(data, suggestion());
    expect(result.workExperiences[0]).toEqual({
      company: 'TechCorp',
      position: 'Software Engineer',
    });
  });

  it('never mutates the original data object', () => {
    const original = { ...data };
    applyCvImportAiSuggestion(data, suggestion());
    expect(data).toEqual(original);
  });

  it('is a safe no-op for an out-of-range index (e.g. the user removed that entry)', () => {
    const result = applyCvImportAiSuggestion(data, suggestion({ index: 5 }));
    expect(result).toEqual(data);
  });

  it('is a safe no-op when index is missing for an array section', () => {
    const result = applyCvImportAiSuggestion(data, suggestion({ index: undefined }));
    expect(result).toEqual(data);
  });
});
