/**
 * A generic, feature-agnostic convention for a prompt to tell
 * `DummyAIProvider` how many items a JSON-array-shaped response field should
 * contain — used by any feature whose response schema includes an array
 * whose correct length depends on the input (e.g. Interview Preparation's
 * `questions[]`/`evaluations[]`, Phase 9), not just a single fixed-shape
 * object (Resume Optimization's `suggestions[]`, Cover Letter's `title`/
 * `coverLetter`, both Phase 7/8, which don't use this and keep their
 * existing fixed-length dummy output unchanged). A prompt builder embeds
 * `buildArrayCountInstruction(n)` verbatim in its rendered text (also a
 * legitimate instruction for a real future provider); `DummyAIProvider`
 * extracts `n` back out with `extractArrayCount()` and sizes its
 * deterministic arrays accordingly — without ever needing to know which
 * feature, or which field name, is asking.
 */
const ARRAY_COUNT_PATTERN = /Respond with an array of exactly (\d+) items?\./i;

export function buildArrayCountInstruction(count: number): string {
  return `Respond with an array of exactly ${count} item${count === 1 ? '' : 's'}.`;
}

export function extractArrayCount(prompt: string, fallback = 1): number {
  const match = prompt.match(ARRAY_COUNT_PATTERN);
  return match ? parseInt(match[1]!, 10) : fallback;
}
