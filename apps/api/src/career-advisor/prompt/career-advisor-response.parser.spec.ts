import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';
import { CareerAdvisorResponseParser } from './career-advisor-response.parser';

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('CareerAdvisorResponseParser', () => {
  const validPayload = {
    summary: 'Focus on closing the gap between your current skills and your target role.',
    currentAssessment: 'You have solid backend fundamentals but limited leadership exposure.',
    strengths: ['Strong TypeScript skills', 'Consistent work history'],
    gaps: ['No leadership experience documented'],
    recommendations: ['Seek a tech-lead opportunity on your current team'],
    nextSteps: ['Update your resume summary to highlight ownership'],
  };

  it('parses a well-formed response into strictly-typed data', () => {
    const result = CareerAdvisorResponseParser.parse(JSON.stringify(validPayload));
    expect(result).toEqual(validPayload);
  });

  it('trims whitespace from string fields and array items', () => {
    const result = CareerAdvisorResponseParser.parse(
      JSON.stringify({ ...validPayload, summary: '  S  ', strengths: ['  A  '] }),
    );
    expect(result.summary).toBe('S');
    expect(result.strengths).toEqual(['A']);
  });

  it('accepts empty arrays for strengths/gaps/recommendations/nextSteps (sparse-data case)', () => {
    const result = CareerAdvisorResponseParser.parse(
      JSON.stringify({
        ...validPayload,
        strengths: [],
        gaps: [],
        recommendations: [],
        nextSteps: [],
      }),
    );
    expect(result.strengths).toEqual([]);
    expect(result.gaps).toEqual([]);
  });

  it.each([
    ['not json at all', 'plainly not json {{{'],
    ['a JSON array instead of an object', JSON.stringify([1, 2, 3])],
    ['a JSON string instead of an object', JSON.stringify('hello')],
    ['null', JSON.stringify(null)],
  ])('throws InvalidPromptError for %s', (_label, raw) => {
    expect(() => CareerAdvisorResponseParser.parse(raw)).toThrow(InvalidPromptError);
  });

  it('throws when summary is missing or empty', () => {
    expect(() =>
      CareerAdvisorResponseParser.parse(JSON.stringify(omit(validPayload, 'summary'))),
    ).toThrow(InvalidPromptError);
    expect(() =>
      CareerAdvisorResponseParser.parse(JSON.stringify({ ...validPayload, summary: '   ' })),
    ).toThrow(InvalidPromptError);
  });

  it('throws when currentAssessment is missing or empty', () => {
    expect(() =>
      CareerAdvisorResponseParser.parse(JSON.stringify(omit(validPayload, 'currentAssessment'))),
    ).toThrow(InvalidPromptError);
  });

  it.each(['strengths', 'gaps', 'recommendations', 'nextSteps'] as const)(
    'throws when "%s" is missing or not an array',
    (field) => {
      expect(() =>
        CareerAdvisorResponseParser.parse(JSON.stringify(omit(validPayload, field))),
      ).toThrow(InvalidPromptError);
      expect(() =>
        CareerAdvisorResponseParser.parse(
          JSON.stringify({ ...validPayload, [field]: 'not an array' }),
        ),
      ).toThrow(InvalidPromptError);
    },
  );

  it('throws when an array field contains a non-string or empty-string item', () => {
    expect(() =>
      CareerAdvisorResponseParser.parse(JSON.stringify({ ...validPayload, strengths: [123] })),
    ).toThrow(InvalidPromptError);
    expect(() =>
      CareerAdvisorResponseParser.parse(JSON.stringify({ ...validPayload, gaps: [''] })),
    ).toThrow(InvalidPromptError);
  });
});
