import { PromptHash } from './prompt-hash.util';

describe('PromptHash', () => {
  it('is deterministic — the same text always produces the same hash', () => {
    expect(PromptHash.generate('hello world')).toBe(PromptHash.generate('hello world'));
  });

  it('produces different hashes for different text', () => {
    expect(PromptHash.generate('hello world')).not.toBe(PromptHash.generate('hello world!'));
  });

  it('produces a 64-character lowercase hex SHA-256 digest', () => {
    const hash = PromptHash.generate('sample prompt');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
