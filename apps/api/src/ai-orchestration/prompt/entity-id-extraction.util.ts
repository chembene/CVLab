/**
 * A generic, feature-agnostic way for `DummyAIProvider` to produce a
 * response that references REAL, already-existing entity ids — needed by
 * any feature whose AI output must name something from a caller-supplied
 * catalog (e.g. Template Recommendation, FASE 21, recommending existing
 * `ResumeTemplate` rows) rather than free-form generated content. A prompt
 * builder that embeds a catalog as `JSON.stringify(items.map(t => ({ id:
 * t.id, ... })))` (as `TemplateRecommendationPromptBuilder` already does to
 * list every template the model may recommend) always contains each
 * entity's real id as a `"id": "<value>"` JSON key/value pair, verbatim, in
 * the prompt text — regardless of whether that id happens to be a UUID or a
 * stable slug (`ResumeTemplate.id` is deliberately the latter, never a
 * random uuid — see resume-templates.seed.ts's own doc comment).
 * `extractEntityIds()` scrapes those values back out; `DummyAIProvider`
 * echoes real ones in its deterministic output, without ever needing to
 * know what a "template" is — same "provider never learns which feature is
 * asking" principle `extractArrayCount()` already established (Phase 9).
 */
const ID_FIELD_PATTERN = /"id"\s*:\s*"([^"]+)"/g;

/** Returns the value of every `"id": "..."` JSON key/value pair found in `prompt`, in first-seen order, deduplicated, capped at `max`. */
export function extractEntityIds(prompt: string, max = 10): string[] {
  const matches: string[] = [];
  for (const match of prompt.matchAll(ID_FIELD_PATTERN)) {
    if (match[1]) matches.push(match[1]);
  }
  const distinct = Array.from(new Set(matches));
  return distinct.slice(0, max);
}
