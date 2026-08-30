import { ProviderUnavailableError } from '../errors/provider-unavailable.error';
import { InvalidPromptError } from '../errors/invalid-prompt.error';
import { RetryLimitExceededError } from '../errors/retry-limit-exceeded.error';
import type { RetryPolicy } from '../interfaces/retry-policy.interface';
import { RetryExecutor } from './retry-executor';

const noopSleep = async () => {};

const policy: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 10,
  maxDelayMs: 100,
  backoff: 'exponential',
};

describe('RetryExecutor', () => {
  const executor = new RetryExecutor();

  it('returns the result on first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await executor.execute(fn, policy, noopSleep);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a retryable AIError and succeeds on a later attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new ProviderUnavailableError('dummy'))
      .mockRejectedValueOnce(new ProviderUnavailableError('dummy'))
      .mockResolvedValueOnce('ok');

    const result = await executor.execute(fn, policy, noopSleep);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws RetryLimitExceededError once every attempt fails with a retryable error', async () => {
    const fn = jest.fn().mockRejectedValue(new ProviderUnavailableError('dummy'));

    await expect(executor.execute(fn, policy, noopSleep)).rejects.toBeInstanceOf(
      RetryLimitExceededError,
    );
    expect(fn).toHaveBeenCalledTimes(policy.maxAttempts);
  });

  it('does not retry a non-retryable AIError — fails immediately on the first attempt', async () => {
    const fn = jest.fn().mockRejectedValue(new InvalidPromptError('bad input'));

    await expect(executor.execute(fn, policy, noopSleep)).rejects.toBeInstanceOf(
      InvalidPromptError,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry a non-AIError — fails immediately, treated as an unexpected bug', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('unexpected'));

    await expect(executor.execute(fn, policy, noopSleep)).rejects.toThrow('unexpected');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('sleeps between attempts using exponential backoff, capped at maxDelayMs', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new ProviderUnavailableError('dummy'))
      .mockRejectedValueOnce(new ProviderUnavailableError('dummy'))
      .mockResolvedValueOnce('ok');

    await executor.execute(
      fn,
      { maxAttempts: 5, baseDelayMs: 10, maxDelayMs: 15, backoff: 'exponential' },
      sleep,
    );

    expect(sleep).toHaveBeenNthCalledWith(1, 10);
    expect(sleep).toHaveBeenNthCalledWith(2, 15); // 10 * 2^1 = 20, capped at maxDelayMs (15)
  });

  it('uses a fixed delay between attempts when backoff is "fixed"', async () => {
    const sleep = jest.fn().mockResolvedValue(undefined);
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new ProviderUnavailableError('dummy'))
      .mockResolvedValueOnce('ok');

    await executor.execute(
      fn,
      { maxAttempts: 3, baseDelayMs: 25, maxDelayMs: 1000, backoff: 'fixed' },
      sleep,
    );

    expect(sleep).toHaveBeenCalledWith(25);
  });
});
