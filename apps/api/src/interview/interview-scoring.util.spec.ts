import { computeSessionScores, type ScoredAnswer } from './interview-scoring.util';

describe('computeSessionScores', () => {
  it('computes overallScore as the mean of every answer', () => {
    const answers: ScoredAnswer[] = [
      { category: 'TECHNICAL', score: 80 },
      { category: 'COMMUNICATION', score: 60 },
      { category: 'BEHAVIORAL', score: 100 },
    ];
    expect(computeSessionScores(answers).overallScore).toBe(80); // (80+60+100)/3 = 80
  });

  it('rounds to the nearest integer', () => {
    const answers: ScoredAnswer[] = [
      { category: 'TECHNICAL', score: 70 },
      { category: 'TECHNICAL', score: 71 },
      { category: 'TECHNICAL', score: 71 },
    ];
    expect(computeSessionScores(answers).technicalScore).toBe(71); // 70.666... -> 71
  });

  it('technicalScore averages only TECHNICAL-category answers', () => {
    const answers: ScoredAnswer[] = [
      { category: 'TECHNICAL', score: 90 },
      { category: 'TECHNICAL', score: 70 },
      { category: 'BEHAVIORAL', score: 10 },
    ];
    expect(computeSessionScores(answers).technicalScore).toBe(80); // (90+70)/2
  });

  it('communicationScore averages only COMMUNICATION-category answers', () => {
    const answers: ScoredAnswer[] = [
      { category: 'COMMUNICATION', score: 40 },
      { category: 'COMMUNICATION', score: 60 },
      { category: 'TECHNICAL', score: 100 },
    ];
    expect(computeSessionScores(answers).communicationScore).toBe(50); // (40+60)/2
  });

  it('confidenceScore averages BEHAVIORAL/SITUATIONAL/LEADERSHIP/CULTURE answers', () => {
    const answers: ScoredAnswer[] = [
      { category: 'BEHAVIORAL', score: 80 },
      { category: 'SITUATIONAL', score: 60 },
      { category: 'LEADERSHIP', score: 100 },
      { category: 'CULTURE', score: 40 },
      { category: 'TECHNICAL', score: 0 }, // must be excluded
    ];
    expect(computeSessionScores(answers).confidenceScore).toBe(70); // (80+60+100+40)/4
  });

  it('falls back to overallScore when a category grouping has no matching answers', () => {
    const answers: ScoredAnswer[] = [
      { category: 'TECHNICAL', score: 100 },
      { category: 'TECHNICAL', score: 60 },
    ];
    const scores = computeSessionScores(answers);
    expect(scores.overallScore).toBe(80);
    expect(scores.technicalScore).toBe(80); // has TECHNICAL answers, not a fallback
    expect(scores.communicationScore).toBe(80); // no COMMUNICATION answers -> falls back
    expect(scores.confidenceScore).toBe(80); // no confidence-category answers -> falls back
  });

  it('returns 0 for an empty answer list, never null or NaN', () => {
    const scores = computeSessionScores([]);
    expect(scores).toEqual({
      overallScore: 0,
      technicalScore: 0,
      communicationScore: 0,
      confidenceScore: 0,
    });
  });

  it('handles a single answer', () => {
    const scores = computeSessionScores([{ category: 'TECHNICAL', score: 55 }]);
    expect(scores.overallScore).toBe(55);
    expect(scores.technicalScore).toBe(55);
  });
});
