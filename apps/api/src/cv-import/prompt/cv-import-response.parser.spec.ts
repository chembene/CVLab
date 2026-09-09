import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';
import { CvImportResponseParser } from './cv-import-response.parser';

describe('CvImportResponseParser', () => {
  const validText = JSON.stringify({
    fieldSuggestions: [
      {
        section: 'workExperiences',
        index: 0,
        field: 'position',
        originalValue: 'Engineer',
        suggestedValue: 'Software Engineer',
        reason: 'More specific title.',
        confidence: 0.8,
      },
    ],
    unresolvedFields: ['Company name at workExperiences[1] looks truncated.'],
  });

  it('parses a valid response, reading fieldSuggestions (not suggestions) into .suggestions', () => {
    const parsed = CvImportResponseParser.parse(validText);
    expect(parsed.suggestions).toHaveLength(1);
    expect(parsed.suggestions[0]).toMatchObject({
      section: 'workExperiences',
      index: 0,
      field: 'position',
      suggestedValue: 'Software Engineer',
      confidence: 0.8,
    });
    expect(parsed.unresolvedFields).toEqual([
      'Company name at workExperiences[1] looks truncated.',
    ]);
  });

  it('accepts an empty fieldSuggestions array (a clean draft with nothing to revise)', () => {
    const parsed = CvImportResponseParser.parse(
      JSON.stringify({ fieldSuggestions: [], unresolvedFields: [] }),
    );
    expect(parsed.suggestions).toEqual([]);
  });

  it('accepts a suggestion for personalData/summary without an index', () => {
    const parsed = CvImportResponseParser.parse(
      JSON.stringify({
        fieldSuggestions: [
          {
            section: 'personalData',
            field: 'fullName',
            originalValue: 'maria sitoe',
            suggestedValue: 'Maria Sitoe',
            reason: 'Proper capitalization.',
            confidence: 0.9,
          },
        ],
        unresolvedFields: [],
      }),
    );
    expect(parsed.suggestions[0]!.index).toBeUndefined();
  });

  it('throws on invalid JSON', () => {
    expect(() => CvImportResponseParser.parse('not json')).toThrow(InvalidPromptError);
  });

  it('throws when the top level is not an object', () => {
    expect(() => CvImportResponseParser.parse('[]')).toThrow(InvalidPromptError);
  });

  it('throws when fieldSuggestions is missing', () => {
    expect(() => CvImportResponseParser.parse(JSON.stringify({ unresolvedFields: [] }))).toThrow(
      InvalidPromptError,
    );
  });

  it('throws when unresolvedFields is missing', () => {
    expect(() => CvImportResponseParser.parse(JSON.stringify({ fieldSuggestions: [] }))).toThrow(
      InvalidPromptError,
    );
  });

  it('throws when a suggestion has an invalid section', () => {
    const bad = JSON.stringify({
      fieldSuggestions: [
        {
          section: 'notASection',
          field: 'x',
          suggestedValue: 'y',
          reason: 'r',
          confidence: 0.5,
        },
      ],
      unresolvedFields: [],
    });
    expect(() => CvImportResponseParser.parse(bad)).toThrow(InvalidPromptError);
  });

  it('throws when confidence is out of range', () => {
    const bad = JSON.stringify({
      fieldSuggestions: [
        {
          section: 'skills',
          index: 0,
          field: 'name',
          suggestedValue: 'y',
          reason: 'r',
          confidence: 1.5,
        },
      ],
      unresolvedFields: [],
    });
    expect(() => CvImportResponseParser.parse(bad)).toThrow(InvalidPromptError);
  });

  it('throws when suggestedValue is empty', () => {
    const bad = JSON.stringify({
      fieldSuggestions: [
        {
          section: 'skills',
          index: 0,
          field: 'name',
          suggestedValue: '',
          reason: 'r',
          confidence: 0.5,
        },
      ],
      unresolvedFields: [],
    });
    expect(() => CvImportResponseParser.parse(bad)).toThrow(InvalidPromptError);
  });

  it('throws when a non-string appears in unresolvedFields', () => {
    const bad = JSON.stringify({ fieldSuggestions: [], unresolvedFields: [42] });
    expect(() => CvImportResponseParser.parse(bad)).toThrow(InvalidPromptError);
  });
});
