import {
  computeRemainingSeconds,
  isSessionExpired,
  sessionDeadline,
  wasTimedOut,
} from './test-timer.util';

describe('computeRemainingSeconds', () => {
  it('returns null when the test has no time limit', () => {
    expect(computeRemainingSeconds(null, new Date())).toBeNull();
  });

  it('computes seconds remaining until the deadline', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z');
    const now = new Date('2026-01-01T10:05:00.000Z');
    // 15-minute limit, 5 minutes elapsed → 10 minutes = 600s remaining.
    expect(computeRemainingSeconds(15, startedAt, now)).toBe(600);
  });

  it('never goes negative — floors at 0 once the deadline has passed', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z');
    const now = new Date('2026-01-01T10:20:00.000Z');
    expect(computeRemainingSeconds(15, startedAt, now)).toBe(0);
  });

  it('returns the full duration when called at startedAt itself', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z');
    expect(computeRemainingSeconds(10, startedAt, startedAt)).toBe(600);
  });
});

describe('isSessionExpired', () => {
  it('is never expired when the test has no time limit', () => {
    const startedAt = new Date('2020-01-01T00:00:00.000Z'); // long ago
    expect(isSessionExpired(null, startedAt)).toBe(false);
  });

  it('is false before the deadline', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z');
    const now = new Date('2026-01-01T10:05:00.000Z');
    expect(isSessionExpired(15, startedAt, now)).toBe(false);
  });

  it('is true exactly at and after the deadline', () => {
    const startedAt = new Date('2026-01-01T10:00:00.000Z');
    const atDeadline = new Date('2026-01-01T10:15:00.000Z');
    const afterDeadline = new Date('2026-01-01T10:16:00.000Z');
    expect(isSessionExpired(15, startedAt, atDeadline)).toBe(true);
    expect(isSessionExpired(15, startedAt, afterDeadline)).toBe(true);
  });
});

describe('sessionDeadline', () => {
  const startedAt = new Date('2026-01-01T10:00:00.000Z');

  it('is startedAt plus the limit in minutes', () => {
    expect(sessionDeadline(15, startedAt)).toEqual(new Date('2026-01-01T10:15:00.000Z'));
  });

  it('is null when the test has no time limit', () => {
    expect(sessionDeadline(null, startedAt)).toBeNull();
  });
});

describe('wasTimedOut', () => {
  const startedAt = new Date('2026-01-01T10:00:00.000Z');

  it('is true when the attempt was closed exactly at the deadline (automatic close)', () => {
    expect(wasTimedOut(15, startedAt, new Date('2026-01-01T10:15:00.000Z'))).toBe(true);
  });

  it('is false when the user submitted before the deadline', () => {
    expect(wasTimedOut(15, startedAt, new Date('2026-01-01T10:10:00.000Z'))).toBe(false);
  });

  it('is false while the attempt is still open (no completedAt)', () => {
    expect(wasTimedOut(15, startedAt, null)).toBe(false);
  });

  it('is never true for a test without a time limit', () => {
    expect(wasTimedOut(null, startedAt, new Date('2026-01-02T10:00:00.000Z'))).toBe(false);
  });
});
