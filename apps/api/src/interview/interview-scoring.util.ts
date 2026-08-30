import type { QuestionCategory } from '@prisma/client';

export interface ScoredAnswer {
  category: QuestionCategory;
  score: number;
}

export interface SessionScores {
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  confidenceScore: number;
}

/**
 * Categories treated as "confidence"-relevant — how someone presents
 * themselves, not what they know. `TECHNICAL` and `COMMUNICATION` each map
 * directly onto their own identically-named `QuestionCategory`; there is no
 * dedicated "confidence" category, so confidence is instead read from the
 * four categories most about self-presentation and composure rather than
 * raw technical knowledge or explicit communication clarity. A disclosed,
 * deterministic design choice — see docs/architecture/interview-engine.md
 * §"Scoring".
 */
const CONFIDENCE_CATEGORIES: readonly QuestionCategory[] = [
  'BEHAVIORAL',
  'SITUATIONAL',
  'LEADERSHIP',
  'CULTURE',
];

function average(scores: number[]): number | null {
  if (scores.length === 0) {
    return null;
  }
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

/**
 * Computes the four session-level scores from the AI's per-answer scores —
 * pure and deterministic, no I/O, no randomness, mirroring
 * ats-scoring.util.ts's (Phase 4) precedent of small, independently-tested
 * pure scoring functions. `overallScore` is the mean of every answer;
 * `technicalScore`/`communicationScore` are the mean of answers in their
 * matching category; `confidenceScore` is the mean of the four
 * `CONFIDENCE_CATEGORIES` above. Any of the three sub-scores falls back to
 * `overallScore` when the session has no questions in that category
 * grouping — never `null`, never `NaN`, always a usable number.
 */
export function computeSessionScores(answers: ScoredAnswer[]): SessionScores {
  const overallScore = average(answers.map((a) => a.score)) ?? 0;
  const technicalScore =
    average(answers.filter((a) => a.category === 'TECHNICAL').map((a) => a.score)) ?? overallScore;
  const communicationScore =
    average(answers.filter((a) => a.category === 'COMMUNICATION').map((a) => a.score)) ??
    overallScore;
  const confidenceScore =
    average(
      answers.filter((a) => CONFIDENCE_CATEGORIES.includes(a.category)).map((a) => a.score),
    ) ?? overallScore;

  return { overallScore, technicalScore, communicationScore, confidenceScore };
}
