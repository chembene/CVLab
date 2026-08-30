import { buildArrayCountInstruction, extractArrayCount } from './array-count-instruction.util';

describe('array-count-instruction.util', () => {
  describe('buildArrayCountInstruction', () => {
    it('pluralizes "items" for counts other than 1', () => {
      expect(buildArrayCountInstruction(6)).toBe('Respond with an array of exactly 6 items.');
      expect(buildArrayCountInstruction(0)).toBe('Respond with an array of exactly 0 items.');
    });

    it('uses singular "item" for exactly 1', () => {
      expect(buildArrayCountInstruction(1)).toBe('Respond with an array of exactly 1 item.');
    });
  });

  describe('extractArrayCount', () => {
    it('extracts the count embedded by buildArrayCountInstruction', () => {
      const prompt = `Some prompt text.\n${buildArrayCountInstruction(8)}\nMore text.`;
      expect(extractArrayCount(prompt)).toBe(8);
    });

    it('is case-insensitive and singular/plural-insensitive', () => {
      expect(extractArrayCount('respond WITH AN ARRAY of exactly 3 item.')).toBe(3);
    });

    it('returns the fallback (default 1) when no instruction is present', () => {
      expect(extractArrayCount('a prompt with no marker at all')).toBe(1);
      expect(extractArrayCount('a prompt with no marker at all', 5)).toBe(5);
    });

    it('extracts 0 correctly, not falling back', () => {
      expect(extractArrayCount(buildArrayCountInstruction(0), 5)).toBe(0);
    });
  });
});
