import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';
import { QuestionResponseParser } from './question-response.parser';

function omit<T extends object, K extends keyof T>(obj: T, key: K): Omit<T, K> {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('QuestionResponseParser', () => {
  const validQuestion = {
    category: 'TECHNICAL',
    question: 'Explain how you would design a rate limiter.',
    idealAnswer: 'A strong answer discusses token bucket / sliding window algorithms.',
    tips: 'Mention trade-offs between accuracy and memory.',
  };
  const validPayload = { questions: [validQuestion] };

  it('parses a well-formed response into strictly-typed data', () => {
    const result = QuestionResponseParser.parse(JSON.stringify(validPayload));
    expect(result).toEqual([
      {
        category: 'TECHNICAL',
        question: validQuestion.question,
        idealAnswer: validQuestion.idealAnswer,
        tips: validQuestion.tips,
      },
    ]);
  });

  it('parses multiple questions in order', () => {
    const second = {
      ...validQuestion,
      category: 'BEHAVIORAL',
      question: 'Tell me about a conflict you resolved.',
    };
    const result = QuestionResponseParser.parse(
      JSON.stringify({ questions: [validQuestion, second] }),
    );
    expect(result).toHaveLength(2);
    expect(result[1]!.category).toBe('BEHAVIORAL');
  });

  it.each([
    ['not json at all', 'plainly not json {{{'],
    ['a JSON array instead of an object', JSON.stringify([1, 2, 3])],
    ['a JSON string instead of an object', JSON.stringify('hello')],
    ['null', JSON.stringify(null)],
  ])('throws InvalidPromptError for %s', (_label, raw) => {
    expect(() => QuestionResponseParser.parse(raw)).toThrow(InvalidPromptError);
  });

  it('throws when questions is missing or not an array', () => {
    expect(() =>
      QuestionResponseParser.parse(JSON.stringify(omit(validPayload, 'questions'))),
    ).toThrow(InvalidPromptError);
    expect(() => QuestionResponseParser.parse(JSON.stringify({ questions: 'nope' }))).toThrow(
      InvalidPromptError,
    );
  });

  it('throws when questions is an empty array', () => {
    expect(() => QuestionResponseParser.parse(JSON.stringify({ questions: [] }))).toThrow(
      InvalidPromptError,
    );
  });

  it.each(['category', 'question', 'idealAnswer', 'tips'])(
    'throws when a question is missing required field "%s"',
    (field) => {
      const broken = omit(validQuestion, field as keyof typeof validQuestion);
      expect(() => QuestionResponseParser.parse(JSON.stringify({ questions: [broken] }))).toThrow(
        InvalidPromptError,
      );
    },
  );

  it('throws when category is not a valid QuestionCategory', () => {
    expect(() =>
      QuestionResponseParser.parse(
        JSON.stringify({ questions: [{ ...validQuestion, category: 'NOT_REAL' }] }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when a field is present but an empty/whitespace string', () => {
    expect(() =>
      QuestionResponseParser.parse(
        JSON.stringify({ questions: [{ ...validQuestion, question: '   ' }] }),
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when a question in the array is not an object', () => {
    expect(() => QuestionResponseParser.parse(JSON.stringify({ questions: ['nope'] }))).toThrow(
      InvalidPromptError,
    );
  });
});
