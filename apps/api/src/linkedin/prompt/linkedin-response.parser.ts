import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';

export interface ParsedLinkedInProfileResponse {
  headline: string;
  about: string;
  skills: string[];
  experienceSuggestions: string[];
  recommendations: string[];
}

/**
 * Validates and parses the AI provider's raw JSON text into a strictly-typed
 * ParsedLinkedInProfileResponse. Runs as an AIExecutionOptions.responseValidator
 * inside AiOrchestrationService's "Validate Response" pipeline step (see
 * LinkedInService.generateProfile()), so any throw here triggers the same
 * automatic credit refund as any other pipeline failure — this parser never
 * touches credits or the ledger itself. Mirrors CareerAdvisorResponseParser's
 * (FASE 18) exact structure.
 */
export class LinkedInResponseParser {
  static parse(rawText: string): ParsedLinkedInProfileResponse {
    const data = this.parseJson(rawText);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new InvalidPromptError('AI response must be a JSON object.');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.headline !== 'string' || obj.headline.trim().length === 0) {
      throw new InvalidPromptError('AI response is missing a non-empty "headline" string.');
    }
    if (typeof obj.about !== 'string' || obj.about.trim().length === 0) {
      throw new InvalidPromptError('AI response is missing a non-empty "about" string.');
    }

    return {
      headline: obj.headline.trim(),
      about: obj.about.trim(),
      skills: this.parseStringArray(obj.skills, 'skills'),
      experienceSuggestions: this.parseStringArray(
        obj.experienceSuggestions,
        'experienceSuggestions',
      ),
      recommendations: this.parseStringArray(obj.recommendations, 'recommendations'),
    };
  }

  /** Empty arrays are valid (e.g. "skills" with no candidate data yet) — only a non-array, or an array containing a non-string, is malformed. */
  private static parseStringArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value)) {
      throw new InvalidPromptError(`AI response is missing a "${field}" array.`);
    }
    return value.map((item, index) => {
      if (typeof item !== 'string' || item.trim().length === 0) {
        throw new InvalidPromptError(
          `AI response "${field}[${index}]" must be a non-empty string.`,
        );
      }
      return item.trim();
    });
  }

  private static parseJson(rawText: string): unknown {
    try {
      return JSON.parse(rawText);
    } catch {
      throw new InvalidPromptError('AI response is not valid JSON.');
    }
  }
}
