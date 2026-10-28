/**
 * FASE 23 — server-authoritative timer logic. No timer infrastructure
 * existed anywhere else in this codebase to reuse (confirmed by audit) — the
 * server never trusts a client-reported elapsed/remaining time; every check
 * here is computed fresh from `TestSession.startedAt` (already persisted,
 * immutable once a session starts) and `Test.timeLimit` (minutes — see
 * technical-test.interface.ts). A test with no `timeLimit` never expires.
 */

/** Seconds remaining until the session's deadline — null when the test has no time limit. Never negative (floors at 0). */
export function computeRemainingSeconds(
  timeLimitMinutes: number | null,
  startedAt: Date,
  now: Date = new Date(),
): number | null {
  if (timeLimitMinutes === null) return null;
  const deadlineMs = startedAt.getTime() + timeLimitMinutes * 60_000;
  return Math.max(0, Math.floor((deadlineMs - now.getTime()) / 1000));
}

/** Whether the session's own time limit has already elapsed — always false for a test with no timeLimit. */
export function isSessionExpired(
  timeLimitMinutes: number | null,
  startedAt: Date,
  now: Date = new Date(),
): boolean {
  const remaining = computeRemainingSeconds(timeLimitMinutes, startedAt, now);
  return remaining !== null && remaining <= 0;
}

/** The instant the session's time limit runs out — null when the test has no time limit. */
export function sessionDeadline(timeLimitMinutes: number | null, startedAt: Date): Date | null {
  if (timeLimitMinutes === null) return null;
  return new Date(startedAt.getTime() + timeLimitMinutes * 60_000);
}

/**
 * Whether a COMPLETED session was closed by the clock rather than by the
 * user. Auto-closing stamps `completedAt` with the deadline itself, and a
 * manual submit is only accepted strictly before the deadline, so
 * `completedAt >= deadline` identifies it without any extra column.
 */
export function wasTimedOut(
  timeLimitMinutes: number | null,
  startedAt: Date,
  completedAt: Date | null,
): boolean {
  const deadline = sessionDeadline(timeLimitMinutes, startedAt);
  return deadline !== null && completedAt !== null && completedAt.getTime() >= deadline.getTime();
}
