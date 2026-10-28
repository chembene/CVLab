/**
 * FASE 23 — server-authoritative timer logic. No timer infrastructure
 * existed anywhere else in this codebase to reuse (confirmed by audit) — the
 * server never trusts a client-reported elapsed/remaining time; every check
 * here is computed fresh from `TestSession.startedAt` (already persisted,
 * immutable once a session starts) and `Test.timeLimit` (minutes — see
 * technical-test.interface.ts). A test with no `timeLimit` never expires.
 */

import type { TestSessionStatus } from './interfaces/technical-test.interface';

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

/**
 * The status a client should see. `EXPIRED` is derived, not stored: an
 * IN_PROGRESS session whose deadline has passed (server clock) reads as
 * EXPIRED, so no background job or retroactive write is needed. A COMPLETED
 * session is never affected, whatever its time limit.
 */
export function resolveSessionStatus(
  storedStatus: string,
  timeLimitMinutes: number | null,
  startedAt: Date,
  now: Date = new Date(),
): TestSessionStatus {
  if (storedStatus === 'COMPLETED') return 'COMPLETED';
  return isSessionExpired(timeLimitMinutes, startedAt, now) ? 'EXPIRED' : 'IN_PROGRESS';
}
