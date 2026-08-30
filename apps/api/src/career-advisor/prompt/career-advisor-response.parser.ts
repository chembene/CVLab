import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';

export interface ParsedCareerAdviceResponse {
  summary: string;
  currentAssessment: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  nextSteps: string[];
}

/**
 * Validates and parses the AI provider's raw JSON text into a strictly-typed
 * ParsedCareerAdviceResponse. Runs as an AIExecutionOptions.responseValidator
 * inside AiOrchestrationService's "Validate Response" pipeline step (see
 * CareerAdvisorService.requestAdvice()), so any throw here triggers the same
 * automatic credit refund as any other pipeline failure — this parser never
 * touches credits or the ledger itself. Mirrors CoverLetterResponseParser's
 * exact structure (Phase 8), extended for the two array-of-string fields
 * with the same style already used elsewhere for string arrays.
 */
export class CareerAdvisorResponseParser {
  static parse(rawText: string): ParsedCareerAdviceResponse {
    const data = this.parseJson(rawText);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new InvalidPromptError('AI response must be a JSON object.');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) {
      throw new InvalidPromptError('AI response is missing a non-empty "summary" string.');
    }
    if (typeof obj.currentAssessment !== 'string' || obj.currentAssessment.trim().length === 0) {
      throw new InvalidPromptError(
        'AI response is missing a non-empty "currentAssessment" string.',
      );
    }

    return {
      summary: obj.summary.trim(),
      currentAssessment: obj.currentAssessment.trim(),
      strengths: this.parseStringArray(obj.strengths, 'strengths'),
      gaps: this.parseStringArray(obj.gaps, 'gaps'),
      recommendations: this.parseStringArray(obj.recommendations, 'recommendations'),
      nextSteps: this.parseStringArray(obj.nextSteps, 'nextSteps'),
    };
  }

  /** Empty arrays are valid (e.g. "strengths" with no candidate data yet) — only a non-array, or an array containing a non-string, is malformed. */
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
