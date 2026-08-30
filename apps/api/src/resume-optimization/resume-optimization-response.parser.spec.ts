import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';
import { ResumeOptimizationResponseParser } from './resume-optimization-response.parser';

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('ResumeOptimizationResponseParser', () => {
  const validSuggestion = {
    type: 'SUMMARY',
    section: 'summary',
    priority: 'HIGH',
    title: 'Sharpen the summary',
    reason: 'The summary is generic.',
    originalText: 'Old summary text.',
    suggestedText: 'New, sharper summary text.',
  };
  const validPayload = {
    summary: 'Overall optimization summary.',
    predictedScore: 88,
    suggestions: [validSuggestion],
  };

  it('parses a well-formed response into strictly-typed data', () => {
    const result = ResumeOptimizationResponseParser.parse(JSON.stringify(validPayload));

    expect(result).toEqual({
      summary: 'Overall optimization summary.',
      predictedScore: 88,
      suggestions: [
        {
          type: 'SUMMARY',
          section: 'summary',
          priority: 'HIGH',
          title: 'Sharpen the summary',
          reason: 'The summary is generic.',
          originalText: 'Old summary text.',
          suggestedText: 'New, sharper summary text.',
        },
      ],
    });
  });

  it('rounds a fractional predictedScore', () => {
    const result = ResumeOptimizationResponseParser.parse(
      JSON.stringify({ ...validPayload, predictedScore: 87.6 }),
    );
    expect(result.predictedScore).toBe(88);
  });

  it('accepts an empty originalText as a valid "new addition" marker', () => {
    const result = ResumeOptimizationResponseParser.parse(
      JSON.stringify({
        ...validPayload,
        suggestions: [{ ...validSuggestion, originalText: '' }],
      }),
    );
    expect(result.suggestions[0]!.originalText).toBe('');
  });

  it.each([
    ['not json at all', 'plainly not json {{{'],
    ['a JSON array instead of an object', JSON.stringify([1, 2, 3])],
    ['a JSON string instead of an object', JSON.stringify('hello')],
    ['null', JSON.stringify(null)],
  ])('throws InvalidPromptError for %s', (_label, raw) => {
    expect(() => ResumeOptimizationResponseParser.parse(raw)).toThrow(InvalidPromptError);
  });

  it('throws when summary is missing', () => {
    const rest = omit(validPayload, 'summary');
    expect(() => ResumeOptimizationResponseParser.parse(JSON.stringify(rest))).toThrow(
      InvalidPromptError,
    );
  });

  it('throws when summary is an empty string', () => {
    expect(() =>
      ResumeOptimizationResponseParser.parse(JSON.stringify({ ...validPayload, summary: '   ' })),
    ).toThrow(InvalidPromptError);
  });

  it('throws when predictedScore is missing or not a number', () => {
    const rest = omit(validPayload, 'predictedScore');
    expect(() => ResumeOptimizationResponseParser.parse(JSON.stringify(rest))).toThrow(
      InvalidPromptError,
    );
    expect(() =>
      ResumeOptimizationResponseParser.parse(
        JSON.stringify({ ...validPayload, predictedScore: '88' }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when predictedScore is out of the 0-100 range', () => {
    expect(() =>
      ResumeOptimizationResponseParser.parse(
        JSON.stringify({ ...validPayload, predictedScore: 101 }),
      ),
    ).toThrow(InvalidPromptError);
    expect(() =>
      ResumeOptimizationResponseParser.parse(
        JSON.stringify({ ...validPayload, predictedScore: -1 }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when suggestions is missing or not an array', () => {
    const rest = omit(validPayload, 'suggestions');
    expect(() => ResumeOptimizationResponseParser.parse(JSON.stringify(rest))).toThrow(
      InvalidPromptError,
    );
    expect(() =>
      ResumeOptimizationResponseParser.parse(
        JSON.stringify({ ...validPayload, suggestions: 'nope' }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when suggestions is an empty array', () => {
    expect(() =>
      ResumeOptimizationResponseParser.parse(JSON.stringify({ ...validPayload, suggestions: [] })),
    ).toThrow(InvalidPromptError);
  });

  it.each(['type', 'section', 'priority', 'title', 'reason', 'suggestedText'])(
    'throws when a suggestion is missing required field "%s"',
    (field) => {
      const broken = { ...validSuggestion } as Record<string, unknown>;
      delete broken[field];
      expect(() =>
        ResumeOptimizationResponseParser.parse(
          JSON.stringify({ ...validPayload, suggestions: [broken] }),
        ),
      ).toThrow(InvalidPromptError);
    },
  );

  it('throws when originalText is present but not a string', () => {
    expect(() =>
      ResumeOptimizationResponseParser.parse(
        JSON.stringify({
          ...validPayload,
          suggestions: [{ ...validSuggestion, originalText: null }],
        }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when suggestion.type is not a valid SuggestionType', () => {
    expect(() =>
      ResumeOptimizationResponseParser.parse(
        JSON.stringify({
          ...validPayload,
          suggestions: [{ ...validSuggestion, type: 'NOT_A_TYPE' }],
        }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when suggestion.priority is not a valid SuggestionPriority', () => {
    expect(() =>
      ResumeOptimizationResponseParser.parse(
        JSON.stringify({
          ...validPayload,
          suggestions: [{ ...validSuggestion, priority: 'URGENT' }],
        }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when a suggestion in the array is not an object', () => {
    expect(() =>
      ResumeOptimizationResponseParser.parse(
        JSON.stringify({ ...validPayload, suggestions: ['nope'] }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('parses multiple suggestions in order', () => {
    const second = { ...validSuggestion, title: 'Second suggestion', type: 'SKILL' };
    const result = ResumeOptimizationResponseParser.parse(
      JSON.stringify({ ...validPayload, suggestions: [validSuggestion, second] }),
    );
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[1]!.title).toBe('Second suggestion');
  });
});
