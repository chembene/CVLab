import type { Question, Test, TestAnswer, TestSession } from '@prisma/client';
import {
  buildSessionView,
  sanitizeQuestion,
  toTechnicalTestSummary,
} from './technical-test-view.builder';
import type { SessionWithRelations } from './tests.repository';

const test: Test = {
  id: 'test-1',
  title: 'SQL Básico',
  category: 'SQL',
  timeLimit: 10,
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

const question: Question = {
  id: 'q1',
  testId: 'test-1',
  prompt: 'Qual comando obtém dados?',
  choices: ['SELECT', 'INSERT'],
  correctAnswer: 'SELECT',
  explanation: 'SELECT consulta dados.',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('sanitizeQuestion', () => {
  it('never includes correctAnswer/explanation when revealAnswer is false', () => {
    const result = sanitizeQuestion(question, 0, false);
    expect(result).not.toHaveProperty('correctAnswer');
    expect(result).not.toHaveProperty('explanation');
  });

  it('includes correctAnswer/explanation when revealAnswer is true', () => {
    const result = sanitizeQuestion(question, 0, true);
    expect(result.correctAnswer).toBe('SELECT');
    expect(result.explanation).toBe('SELECT consulta dados.');
  });

  it('never reveals isCorrect before revealAnswer, even if an answer exists', () => {
    const result = sanitizeQuestion(question, 0, false, {
      selectedAnswer: 'SELECT',
      isCorrect: true,
    });
    expect(result.isCorrect).toBeNull();
    expect(result.selectedAnswer).toBe('SELECT'); // the user's own choice is always visible
  });

  it('reveals isCorrect once revealAnswer is true', () => {
    const result = sanitizeQuestion(question, 0, true, {
      selectedAnswer: 'SELECT',
      isCorrect: true,
    });
    expect(result.isCorrect).toBe(true);
  });

  it('defaults selectedAnswer/isCorrect to null when no answer was ever submitted', () => {
    const result = sanitizeQuestion(question, 0, true);
    expect(result.selectedAnswer).toBeNull();
    expect(result.isCorrect).toBeNull();
  });
});

describe('toTechnicalTestSummary', () => {
  it('maps the test fields plus a given question count', () => {
    expect(toTechnicalTestSummary(test, 4)).toEqual({
      id: 'test-1',
      title: 'SQL Básico',
      category: 'SQL',
      timeLimit: 10,
      questionCount: 4,
    });
  });
});

describe('buildSessionView', () => {
  const baseSession: TestSession = {
    id: 'session-1',
    userId: 'user-1',
    testId: 'test-1',
    attemptNumber: 1,
    status: 'IN_PROGRESS',
    score: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('never reveals answers for an IN_PROGRESS session', () => {
    const session: SessionWithRelations = { ...baseSession, test, answers: [] };
    const view = buildSessionView(session, [question]);
    expect(view.status).toBe('IN_PROGRESS');
    expect(view.questions[0]).not.toHaveProperty('correctAnswer');
  });

  it('reveals answers for a COMPLETED session', () => {
    const answer: TestAnswer & { question: Question } = {
      id: 'a1',
      testSessionId: 'session-1',
      questionId: 'q1',
      selectedAnswer: 'SELECT',
      isCorrect: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      question,
    };
    const session: SessionWithRelations = {
      ...baseSession,
      status: 'COMPLETED',
      score: 100,
      test,
      answers: [answer],
    };
    const view = buildSessionView(session, [question]);
    expect(view.questions[0]!.correctAnswer).toBe('SELECT');
    expect(view.questions[0]!.isCorrect).toBe(true);
    expect(view.score).toBe(100);
  });

  it('includes every test question, even one with no answer yet', () => {
    const session: SessionWithRelations = { ...baseSession, test, answers: [] };
    const view = buildSessionView(session, [question]);
    expect(view.questions).toHaveLength(1);
    expect(view.questions[0]!.selectedAnswer).toBeNull();
  });

  it('remainingSeconds is null once the session is COMPLETED, even if the test has a time limit', () => {
    const session: SessionWithRelations = {
      ...baseSession,
      status: 'COMPLETED',
      test,
      answers: [],
    };
    const view = buildSessionView(session, [question]);
    expect(view.remainingSeconds).toBeNull();
  });

  it('remainingSeconds is computed for an IN_PROGRESS session with a time limit', () => {
    const session: SessionWithRelations = { ...baseSession, test, answers: [] };
    const view = buildSessionView(session, [question]);
    expect(view.remainingSeconds).not.toBeNull();
    expect(view.remainingSeconds).toBeGreaterThan(0);
  });
});
