import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';
import { TemplateRecommendationResponseParser } from './template-recommendation-response.parser';

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('TemplateRecommendationResponseParser', () => {
  const validItem = {
    templateId: 'tpl-1',
    rank: 1,
    score: 82,
    reason: 'ATS-friendly and matches seniority.',
  };
  const validPayload = {
    summary: 'These templates suit a senior backend profile.',
    templateRecommendations: [validItem],
  };

  it('parses a well-formed response into strictly-typed data', () => {
    const result = TemplateRecommendationResponseParser.parse(JSON.stringify(validPayload));
    expect(result).toEqual(validPayload);
  });

  it('trims whitespace and rounds numeric fields', () => {
    const result = TemplateRecommendationResponseParser.parse(
      JSON.stringify({
        summary: '  S  ',
        templateRecommendations: [
          { ...validItem, templateId: '  tpl-1  ', rank: 1.4, score: 82.6 },
        ],
      }),
    );
    expect(result.summary).toBe('S');
    expect(result.templateRecommendations[0]).toEqual({
      ...validItem,
      templateId: 'tpl-1',
      rank: 1,
      score: 83,
    });
  });

  it.each([
    ['not json at all', 'plainly not json {{{'],
    ['a JSON array instead of an object', JSON.stringify([1, 2, 3])],
    ['a JSON string instead of an object', JSON.stringify('hello')],
    ['null', JSON.stringify(null)],
  ])('throws InvalidPromptError for %s', (_label, raw) => {
    expect(() => TemplateRecommendationResponseParser.parse(raw)).toThrow(InvalidPromptError);
  });

  it('throws when summary is missing or empty', () => {
    expect(() =>
      TemplateRecommendationResponseParser.parse(JSON.stringify(omit(validPayload, 'summary'))),
    ).toThrow(InvalidPromptError);
    expect(() =>
      TemplateRecommendationResponseParser.parse(
        JSON.stringify({ ...validPayload, summary: '   ' }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when templateRecommendations is missing, not an array, or empty', () => {
    expect(() =>
      TemplateRecommendationResponseParser.parse(
        JSON.stringify(omit(validPayload, 'templateRecommendations')),
      ),
    ).toThrow(InvalidPromptError);
    expect(() =>
      TemplateRecommendationResponseParser.parse(
        JSON.stringify({ ...validPayload, templateRecommendations: 'x' }),
      ),
    ).toThrow(InvalidPromptError);
    expect(() =>
      TemplateRecommendationResponseParser.parse(
        JSON.stringify({ ...validPayload, templateRecommendations: [] }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when an item is missing a required field', () => {
    for (const key of ['templateId', 'rank', 'score', 'reason'] as const) {
      const malformed = { ...validPayload, templateRecommendations: [omit(validItem, key)] };
      expect(() => TemplateRecommendationResponseParser.parse(JSON.stringify(malformed))).toThrow(
        InvalidPromptError,
      );
    }
  });

  it('throws when rank is not a number >= 1', () => {
    const malformed = { ...validPayload, templateRecommendations: [{ ...validItem, rank: 0 }] };
    expect(() => TemplateRecommendationResponseParser.parse(JSON.stringify(malformed))).toThrow(
      InvalidPromptError,
    );
  });

  it('throws when score is outside the 0-100 range', () => {
    expect(() =>
      TemplateRecommendationResponseParser.parse(
        JSON.stringify({ ...validPayload, templateRecommendations: [{ ...validItem, score: -1 }] }),
      ),
    ).toThrow(InvalidPromptError);
    expect(() =>
      TemplateRecommendationResponseParser.parse(
        JSON.stringify({
          ...validPayload,
          templateRecommendations: [{ ...validItem, score: 101 }],
        }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when an item is not an object', () => {
    const malformed = { ...validPayload, templateRecommendations: ['not an object'] };
    expect(() => TemplateRecommendationResponseParser.parse(JSON.stringify(malformed))).toThrow(
      InvalidPromptError,
    );
  });

  it('accepts multiple recommendation items', () => {
    const payload = {
      ...validPayload,
      templateRecommendations: [validItem, { ...validItem, templateId: 'tpl-2', rank: 2 }],
    };
    const result = TemplateRecommendationResponseParser.parse(JSON.stringify(payload));
    expect(result.templateRecommendations).toHaveLength(2);
  });
});
