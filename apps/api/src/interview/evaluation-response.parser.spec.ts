import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';
import { EvaluationResponseParser } from './evaluation-response.parser';

const validEvaluation = {
  score: 82,
  feedback: 'Strong answer with a clear example, could quantify impact more.',
  strengths: ['Clear structure', 'Relevant example'],
  improvements: ['Quantify the outcome'],
};

describe('EvaluationResponseParser', () => {
  it('parses a well-formed response matching expectedCount', () => {
    const result = EvaluationResponseParser.parse(
      JSON.stringify({ evaluations: [validEvaluation] }),
      1,
    );
    expect(result).toEqual([validEvaluation]);
  });

  it('rounds a fractional score', () => {
    const result = EvaluationResponseParser.parse(
      JSON.stringify({ evaluations: [{ ...validEvaluation, score: 81.6 }] }),
      1,
    );
    expect(result[0]!.score).toBe(82);
  });

  it('accepts empty strengths/improvements arrays', () => {
    const result = EvaluationResponseParser.parse(
      JSON.stringify({ evaluations: [{ ...validEvaluation, strengths: [], improvements: [] }] }),
      1,
    );
    expect(result[0]!.strengths).toEqual([]);
    expect(result[0]!.improvements).toEqual([]);
  });

  it('parses multiple evaluations in order', () => {
    const second = { ...validEvaluation, score: 40 };
    const result = EvaluationResponseParser.parse(
      JSON.stringify({ evaluations: [validEvaluation, second] }),
      2,
    );
    expect(result).toHaveLength(2);
    expect(result[1]!.score).toBe(40);
  });

  it.each([
    ['not json at all', 'plainly not json {{{'],
    ['a JSON array instead of an object', JSON.stringify([1, 2, 3])],
    ['null', JSON.stringify(null)],
  ])('throws InvalidPromptError for %s', (_label, raw) => {
    expect(() => EvaluationResponseParser.parse(raw, 1)).toThrow(InvalidPromptError);
  });

  it('throws when evaluations is missing or not an array', () => {
    expect(() => EvaluationResponseParser.parse(JSON.stringify({}), 1)).toThrow(InvalidPromptError);
    expect(() =>
      EvaluationResponseParser.parse(JSON.stringify({ evaluations: 'nope' }), 1),
    ).toThrow(InvalidPromptError);
  });

  it('throws when the array length does not match expectedCount', () => {
    expect(() =>
      EvaluationResponseParser.parse(JSON.stringify({ evaluations: [validEvaluation] }), 2),
    ).toThrow(InvalidPromptError);
    expect(() =>
      EvaluationResponseParser.parse(
        JSON.stringify({ evaluations: [validEvaluation, validEvaluation] }),
        1,
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when evaluations is an empty array but expectedCount > 0', () => {
    expect(() => EvaluationResponseParser.parse(JSON.stringify({ evaluations: [] }), 1)).toThrow(
      InvalidPromptError,
    );
  });

  it('accepts an empty evaluations array when expectedCount is 0', () => {
    expect(EvaluationResponseParser.parse(JSON.stringify({ evaluations: [] }), 0)).toEqual([]);
  });

  it('throws when score is out of range or not a number', () => {
    expect(() =>
      EvaluationResponseParser.parse(
        JSON.stringify({ evaluations: [{ ...validEvaluation, score: 101 }] }),
        1,
      ),
    ).toThrow(InvalidPromptError);
    expect(() =>
      EvaluationResponseParser.parse(
        JSON.stringify({ evaluations: [{ ...validEvaluation, score: '82' }] }),
        1,
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when feedback is missing or empty', () => {
    expect(() =>
      EvaluationResponseParser.parse(
        JSON.stringify({ evaluations: [{ ...validEvaluation, feedback: '' }] }),
        1,
      ),
    ).toThrow(InvalidPromptError);
  });

  it('throws when strengths/improvements are not string arrays', () => {
    expect(() =>
      EvaluationResponseParser.parse(
        JSON.stringify({ evaluations: [{ ...validEvaluation, strengths: 'not an array' }] }),
        1,
      ),
    ).toThrow(InvalidPromptError);
    expect(() =>
      EvaluationResponseParser.parse(
        JSON.stringify({ evaluations: [{ ...validEvaluation, improvements: [1, 2] }] }),
        1,
      ),
    ).toThrow(InvalidPromptError);
  });
});
