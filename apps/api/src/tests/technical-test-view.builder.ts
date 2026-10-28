import type { Question, Test } from '@prisma/client';
import { computeRemainingSeconds, wasTimedOut } from './test-timer.util';
import type {
  SanitizedQuestion,
  TechnicalTestSummary,
  TestSessionStatus,
  TestSessionView,
} from './interfaces/technical-test.interface';
import type { SessionWithRelations } from './tests.repository';

export function toTechnicalTestSummary(test: Test, questionCount: number): TechnicalTestSummary {
  return {
    id: test.id,
    title: test.title,
    category: test.category,
    timeLimit: test.timeLimit,
    questionCount,
  };
}

/**
 * Never includes `correctAnswer`/`explanation` unless `revealAnswer` is
 * true — the one structural enforcement of "never expose correct answers
 * before submission". `revealAnswer` is true only once the session's own
 * status is COMPLETED (see buildSessionView()) — never derived from
 * anything the client sends.
 */
export function sanitizeQuestion(
  question: Question,
  order: number,
  revealAnswer: boolean,
  answer?: { selectedAnswer: string | null; isCorrect: boolean | null },
): SanitizedQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    choices: question.choices as string[],
    order,
    ...(revealAnswer
      ? { correctAnswer: question.correctAnswer, explanation: question.explanation }
      : {}),
    selectedAnswer: answer?.selectedAnswer ?? null,
    isCorrect: revealAnswer ? (answer?.isCorrect ?? null) : null,
  };
}

/**
 * Builds the full session view from a repository read plus the test's
 * complete, ordered question list (always passed in — not just the ones
 * with an answer so far, so an unanswered question still appears with
 * `selectedAnswer: null` instead of silently vanishing from the response).
 * `revealAnswer` (COMPLETED sessions only) is decided in exactly one place
 * here, so no caller can accidentally leak answers for an in-progress
 * session.
 */
export function buildSessionView(
  session: SessionWithRelations,
  allQuestions: Question[],
): TestSessionView {
  const status = session.status as TestSessionStatus;
  const revealAnswer = status === 'COMPLETED';
  const answersByQuestionId = new Map(session.answers.map((a) => [a.questionId, a]));

  const questions = allQuestions.map((q, index) =>
    sanitizeQuestion(q, index, revealAnswer, answersByQuestionId.get(q.id)),
  );

  return {
    id: session.id,
    userId: session.userId,
    testId: session.testId,
    attemptNumber: session.attemptNumber,
    status,
    score: session.score,
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    timedOut: wasTimedOut(session.test.timeLimit, session.startedAt, session.completedAt),
    remainingSeconds: revealAnswer
      ? null
      : computeRemainingSeconds(session.test.timeLimit, session.startedAt),
    test: toTechnicalTestSummary(session.test, questions.length),
    questions,
  };
}
