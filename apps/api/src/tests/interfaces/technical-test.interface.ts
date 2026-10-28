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
export type TestSessionStatus = 'IN_PROGRESS' | 'COMPLETED';

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
  /** True when the attempt was closed automatically because its time limit ran out (completedAt is then exactly the deadline) rather than submitted by the user. */
  timedOut: boolean;
  /** Server-computed — null when the test has no timeLimit, or once the session is COMPLETED. Never trust a client-reported value for this. */
  remainingSeconds: number | null;
  test: TechnicalTestSummary;
  questions: SanitizedQuestion[];
}
