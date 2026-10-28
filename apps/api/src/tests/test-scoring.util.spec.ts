import { computeScorePercentage, isAnswerCorrect } from './test-scoring.util';

describe('isAnswerCorrect', () => {
  it('is true for an exact match', () => {
    expect(isAnswerCorrect('SELECT', 'SELECT')).toBe(true);
  });

  it('is false for a different answer', () => {
    expect(isAnswerCorrect('INSERT', 'SELECT')).toBe(false);
  });

  it('is false (never AI, never inferred) when no answer was submitted', () => {
    expect(isAnswerCorrect(null, 'SELECT')).toBe(false);
  });

  it('is case-sensitive — never a fuzzy match', () => {
    expect(isAnswerCorrect('select', 'SELECT')).toBe(false);
  });
});

describe('computeScorePercentage', () => {
  it('computes a rounded percentage', () => {
    expect(computeScorePercentage(3, 4)).toBe(75);
  });

  it('rounds to the nearest integer', () => {
    expect(computeScorePercentage(1, 3)).toBe(33);
  });

  it('is 100 when every answer is correct', () => {
    expect(computeScorePercentage(5, 5)).toBe(100);
  });

  it('is 0 when nothing is correct', () => {
    expect(computeScorePercentage(0, 5)).toBe(0);
  });

  it('never divides by zero — returns 0 for a test with no questions', () => {
    expect(computeScorePercentage(0, 0)).toBe(0);
  });
});
