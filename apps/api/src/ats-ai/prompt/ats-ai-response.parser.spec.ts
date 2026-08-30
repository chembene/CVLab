import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';
import { AtsAiResponseParser } from './ats-ai-response.parser';

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('AtsAiResponseParser', () => {
  const validRecommendation = {
    priority: 'HIGH',
    category: 'Keywords',
    explanation: 'Kubernetes appears in the job target but not in the résumé.',
    recommendation: 'Add "Kubernetes" to your skills section.',
  };

  const validPayload = {
    overallAssessment: 'Your résumé is a moderate match for this role.',
    strengths: ['Strong TypeScript experience'],
    priorityIssues: [validRecommendation],
    contentRecommendations: [validRecommendation],
    sectionRecommendations: [validRecommendation],
    actionPlan: ['Add the missing Kubernetes keyword to your skills section.'],
  };

  it('parses a well-formed response into strictly-typed data', () => {
    const result = AtsAiResponseParser.parse(JSON.stringify(validPayload));
    expect(result).toEqual(validPayload);
  });

  it('trims whitespace from string fields', () => {
    const result = AtsAiResponseParser.parse(
      JSON.stringify({ ...validPayload, overallAssessment: '  A  ' }),
    );
    expect(result.overallAssessment).toBe('A');
  });

  it('accepts empty arrays for strengths/priorityIssues/contentRecommendations/sectionRecommendations/actionPlan', () => {
    const result = AtsAiResponseParser.parse(
      JSON.stringify({
        ...validPayload,
        strengths: [],
        priorityIssues: [],
        contentRecommendations: [],
        sectionRecommendations: [],
        actionPlan: [],
      }),
    );
    expect(result.priorityIssues).toEqual([]);
    expect(result.strengths).toEqual([]);
  });

  it.each([
    ['not json at all', 'plainly not json {{{'],
    ['a JSON array instead of an object', JSON.stringify([1, 2, 3])],
    ['a JSON string instead of an object', JSON.stringify('hello')],
    ['null', JSON.stringify(null)],
  ])('throws InvalidPromptError for %s', (_label, raw) => {
    expect(() => AtsAiResponseParser.parse(raw)).toThrow(InvalidPromptError);
  });

  it('throws when overallAssessment is missing or empty', () => {
    expect(() =>
      AtsAiResponseParser.parse(JSON.stringify(omit(validPayload, 'overallAssessment'))),
    ).toThrow(InvalidPromptError);
    expect(() =>
      AtsAiResponseParser.parse(JSON.stringify({ ...validPayload, overallAssessment: '   ' })),
    ).toThrow(InvalidPromptError);
  });

  it.each(['strengths', 'actionPlan'] as const)(
    'throws when "%s" is missing or not an array',
    (field) => {
      expect(() => AtsAiResponseParser.parse(JSON.stringify(omit(validPayload, field)))).toThrow(
        InvalidPromptError,
      );
      expect(() =>
        AtsAiResponseParser.parse(JSON.stringify({ ...validPayload, [field]: 'not an array' })),
      ).toThrow(InvalidPromptError);
    },
  );

  it.each(['priorityIssues', 'contentRecommendations', 'sectionRecommendations'] as const)(
    'throws when "%s" is missing or not an array',
    (field) => {
      expect(() => AtsAiResponseParser.parse(JSON.stringify(omit(validPayload, field)))).toThrow(
        InvalidPromptError,
      );
      expect(() =>
        AtsAiResponseParser.parse(JSON.stringify({ ...validPayload, [field]: 'not an array' })),
      ).toThrow(InvalidPromptError);
    },
  );

  it('throws when a recommendation item is missing a required field', () => {
    for (const key of ['priority', 'category', 'explanation', 'recommendation'] as const) {
      const malformed = { ...validPayload, priorityIssues: [omit(validRecommendation, key)] };
      expect(() => AtsAiResponseParser.parse(JSON.stringify(malformed))).toThrow(
        InvalidPromptError,
      );
    }
  });

  it('throws when a recommendation item has an invalid priority value', () => {
    const malformed = {
      ...validPayload,
      priorityIssues: [{ ...validRecommendation, priority: 'URGENT' }],
    };
    expect(() => AtsAiResponseParser.parse(JSON.stringify(malformed))).toThrow(InvalidPromptError);
  });

  it('throws when a recommendation item is not an object', () => {
    const malformed = { ...validPayload, priorityIssues: ['not an object'] };
    expect(() => AtsAiResponseParser.parse(JSON.stringify(malformed))).toThrow(InvalidPromptError);
  });

  it('accepts every valid SuggestionPriority value', () => {
    for (const priority of ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']) {
      const payload = { ...validPayload, priorityIssues: [{ ...validRecommendation, priority }] };
      expect(() => AtsAiResponseParser.parse(JSON.stringify(payload))).not.toThrow();
    }
  });
});
