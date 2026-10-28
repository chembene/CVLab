/**
 * FASE 23 — deterministic scoring only, per the brief's explicit "Do not use
 * AI for ordinary multiple-choice scoring." An answer is correct only when
 * it's a non-null, exact (case-sensitive) match to the question's stored
 * `correctAnswer` — an unanswered question (no row, or `selectedAnswer:
 * null`) always scores as incorrect, never skipped/excluded from the total.
 */
export function isAnswerCorrect(selectedAnswer: string | null, correctAnswer: string): boolean {
  return selectedAnswer !== null && selectedAnswer === correctAnswer;
}

/** Percentage score (0-100, rounded), matching this codebase's existing score conventions (ATS/Interview). `totalQuestions === 0` returns 0 rather than dividing by zero — defensive; a real Test always has at least one question by the time a session can be started. */
export function computeScorePercentage(correctCount: number, totalQuestions: number): number {
  if (totalQuestions === 0) return 0;
  return Math.round((correctCount / totalQuestions) * 100);
}
