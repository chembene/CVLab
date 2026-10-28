/**
 * FASE 23 — Technical Tests Engine (docs/architecture/technical-tests.md).
 * `TestSession.status` stays a raw `String` column in the schema (see the
 * migration's own doc comment) — this union is where the fixed set of valid
 * values is actually enforced, at the application layer, exactly the way a
 * genuinely-empty, never-referenced dormant table's one inconsistency (every
 * other status-like column in this schema is a real Postgres enum) gets
 * fixed without a non-trivial ALTER TYPE migration for a table with zero
 * rows in any environment.
 */
/** `EXPIRED` is derived at read time (resolveSessionStatus()), never persisted — the column only ever holds IN_PROGRESS or COMPLETED. */
export type TestSessionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

/** `Test.timeLimit` is denominated in MINUTES — undocumented anywhere before this phase (the column predates any implementation); this is the convention this phase establishes and the only place it's derived from. */
export const TIME_LIMIT_UNIT = 'minutes';

/** One question, shaped for the catalog/in-progress views — `correctAnswer`/`explanation` are only ever populated once `revealAnswer` is true (see sanitizeQuestion()) — "never expose correct answers before submission". */
export interface SanitizedQuestion {
  id: string;
  prompt: string;
  choices: string[];
  order: number;
  correctAnswer?: string;
  explanation?: string | null;
  selectedAnswer?: string | null;
  isCorrect?: boolean | null;
}

export interface TechnicalTestSummary {
  id: string;
  title: string;
  category: string | null;
  timeLimit: number | null;
  questionCount: number;
}

export interface TestSessionView {
  id: string;
  userId: string;
  testId: string;
  attemptNumber: number;
  status: TestSessionStatus;
  score: number | null;
  startedAt: Date;
  completedAt: Date | null;
  /** Server-computed — null when the test has no timeLimit, or once the session is COMPLETED. Never trust a client-reported value for this. */
  remainingSeconds: number | null;
  test: TechnicalTestSummary;
  questions: SanitizedQuestion[];
}
