import { DummyAIProvider } from './dummy-ai-provider';
import { buildArrayCountInstruction } from '../prompt/array-count-instruction.util';

describe('DummyAIProvider', () => {
  const provider = new DummyAIProvider();

  it('has a stable registry name', () => {
    expect(provider.name).toBe('dummy');
  });

  it('generate() is deterministic — the same prompt always produces the same text and requestId', async () => {
    const first = await provider.generate({ prompt: 'Improve my summary.' });
    const second = await provider.generate({ prompt: 'Improve my summary.' });

    expect(first.text).toBe(second.text);
    expect(first.requestId).toBe(second.requestId);
  });

  it('generate() produces different output for different prompts', async () => {
    const a = await provider.generate({ prompt: 'prompt A' });
    const b = await provider.generate({ prompt: 'prompt B' });

    expect(a.text).not.toBe(b.text);
    expect(a.requestId).not.toBe(b.requestId);
  });

  it('generate() never calls any external API and returns a finishReason of "stop"', async () => {
    const result = await provider.generate({ prompt: 'anything' });
    expect(result.finishReason).toBe('stop');
    expect(result.provider).toBe('dummy');
    expect(result.tokenUsage.totalTokens).toBe(
      result.tokenUsage.inputTokens + result.tokenUsage.outputTokens,
    );
  });

  it('respects an explicit model override', async () => {
    const result = await provider.generate({ prompt: 'x', model: 'dummy-v1-fast' });
    expect(result.model).toBe('dummy-v1-fast');
  });

  it('countTokens() is deterministic and scales with text length', async () => {
    const short = await provider.countTokens('hi');
    const long = await provider.countTokens('a much longer piece of text than the short one');
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });

  it('estimateCost() returns a non-negative deterministic estimate', async () => {
    const first = await provider.estimateCost({ prompt: 'hello' });
    const second = await provider.estimateCost({ prompt: 'hello' });
    expect(first).toEqual(second);
    expect(first.estimatedCost).toBeGreaterThanOrEqual(0);
    expect(first.currency).toBe('USD');
  });

  it('supportedModels() returns a non-empty, stable list', () => {
    expect(provider.supportedModels()).toEqual(['dummy-v1', 'dummy-v1-fast']);
  });

  it('health() reports available: true without any external call', async () => {
    const status = await provider.health();
    expect(status).toMatchObject({ provider: 'dummy', available: true });
    expect(status.checkedAt).toBeInstanceOf(Date);
  });

  it("stream() yields chunks whose concatenated deltas match generate()'s text, ending with a done chunk", async () => {
    const result = await provider.generate({ prompt: 'stream me' });
    const chunks: { delta: string; done: boolean }[] = [];
    for await (const chunk of provider.stream({ prompt: 'stream me' })) {
      chunks.push(chunk);
    }

    const last = chunks[chunks.length - 1];
    expect(last).toBeDefined();
    expect(last?.done).toBe(true);
    expect(last?.delta).toBe('');
    expect(
      chunks
        .map((c) => c.delta)
        .join('')
        .trim(),
    ).toBe(result.text);
  });

  describe('responseFormat: "json"', () => {
    it('returns syntactically valid, deterministic JSON matching the generic contract', async () => {
      const first = await provider.generate({
        prompt: 'optimize my resume',
        responseFormat: 'json',
      });
      const second = await provider.generate({
        prompt: 'optimize my resume',
        responseFormat: 'json',
      });

      expect(first.text).toBe(second.text);
      const parsed = JSON.parse(first.text);
      expect(typeof parsed.summary).toBe('string');
      expect(parsed.summary.length).toBeGreaterThan(0);
      expect(typeof parsed.predictedScore).toBe('number');
      expect(parsed.predictedScore).toBeGreaterThanOrEqual(60);
      expect(parsed.predictedScore).toBeLessThan(100);
      expect(Array.isArray(parsed.suggestions)).toBe(true);
      expect(parsed.suggestions.length).toBeGreaterThan(0);
      const suggestion = parsed.suggestions[0];
      expect(suggestion).toMatchObject({
        type: expect.any(String),
        section: expect.any(String),
        priority: expect.any(String),
        title: expect.any(String),
        reason: expect.any(String),
        originalText: expect.any(String),
        suggestedText: expect.any(String),
      });

      // Superset envelope — also satisfies Cover Letter's contract, without
      // DummyAIProvider knowing that feature exists.
      expect(typeof parsed.title).toBe('string');
      expect(parsed.title.length).toBeGreaterThan(0);
      expect(typeof parsed.coverLetter).toBe('string');
      expect(parsed.coverLetter.length).toBeGreaterThan(0);
    });

    it('produces different JSON for different prompts, still always valid', async () => {
      const a = await provider.generate({ prompt: 'prompt A', responseFormat: 'json' });
      const b = await provider.generate({ prompt: 'prompt B', responseFormat: 'json' });

      expect(a.text).not.toBe(b.text);
      expect(() => JSON.parse(a.text)).not.toThrow();
      expect(() => JSON.parse(b.text)).not.toThrow();
    });

    it('defaults to free text when responseFormat is omitted', async () => {
      const result = await provider.generate({ prompt: 'no format specified' });
      expect(() => JSON.parse(result.text)).toThrow();
    });

    it('sizes questions[]/evaluations[] to the array-count instruction embedded in the prompt', async () => {
      const prompt = `Generate interview questions.\n${buildArrayCountInstruction(4)}`;
      const result = await provider.generate({ prompt, responseFormat: 'json' });
      const parsed = JSON.parse(result.text);

      expect(parsed.questions).toHaveLength(4);
      expect(parsed.evaluations).toHaveLength(4);
      for (const q of parsed.questions) {
        expect([
          'BEHAVIORAL',
          'TECHNICAL',
          'SITUATIONAL',
          'CULTURE',
          'LEADERSHIP',
          'COMMUNICATION',
        ]).toContain(q.category);
        expect(typeof q.question).toBe('string');
        expect(typeof q.idealAnswer).toBe('string');
        expect(typeof q.tips).toBe('string');
      }
      for (const e of parsed.evaluations) {
        expect(typeof e.score).toBe('number');
        expect(e.score).toBeGreaterThanOrEqual(60);
        expect(e.score).toBeLessThan(100);
        expect(typeof e.feedback).toBe('string');
        expect(Array.isArray(e.strengths)).toBe(true);
        expect(Array.isArray(e.improvements)).toBe(true);
      }
    });

    it('defaults questions[]/evaluations[] to length 1 when no array-count instruction is present', async () => {
      const result = await provider.generate({
        prompt: 'no count marker here',
        responseFormat: 'json',
      });
      const parsed = JSON.parse(result.text);
      expect(parsed.questions).toHaveLength(1);
      expect(parsed.evaluations).toHaveLength(1);
    });
  });
});
