import { computeRemainingSeconds, isSessionExpired, resolveSessionStatus } from './test-timer.util';

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

describe('resolveSessionStatus', () => {
  const startedAt = new Date('2026-01-01T10:00:00Z');
  const within = new Date('2026-01-01T10:05:00Z'); // 5 of 15 minutes
  const after = new Date('2026-01-01T10:20:00Z'); // 20 of 15 minutes

  it('IN_PROGRESS within the time limit', () => {
    expect(resolveSessionStatus('IN_PROGRESS', 15, startedAt, within)).toBe('IN_PROGRESS');
  });

  it('EXPIRED once an IN_PROGRESS session is past its time limit', () => {
    expect(resolveSessionStatus('IN_PROGRESS', 15, startedAt, after)).toBe('EXPIRED');
  });

  it('COMPLETED is never affected by the time limit', () => {
    expect(resolveSessionStatus('COMPLETED', 15, startedAt, after)).toBe('COMPLETED');
  });

  it('IN_PROGRESS forever when the test has no time limit', () => {
    expect(resolveSessionStatus('IN_PROGRESS', null, startedAt, after)).toBe('IN_PROGRESS');
  });
});
