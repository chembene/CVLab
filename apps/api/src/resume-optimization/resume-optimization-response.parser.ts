import { SuggestionPriority, SuggestionType } from '@prisma/client';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

export interface ParsedSuggestion {
  type: SuggestionType;
  section: string;
  priority: SuggestionPriority;
  title: string;
  reason: string;
  originalText: string;
  suggestedText: string;
}

export interface ParsedOptimizationResponse {
  summary: string;
  predictedScore: number;
  suggestions: ParsedSuggestion[];
}

const SUGGESTION_TYPES = new Set<string>(Object.values(SuggestionType));
const SUGGESTION_PRIORITIES = new Set<string>(Object.values(SuggestionPriority));

/**
 * Validates and parses the AI provider's raw JSON text into a strictly-typed
 * ParsedOptimizationResponse — per this phase's brief: "Validate JSON,
 * required fields, types, empty arrays. Throw InvalidPromptError when
 * malformed." Runs as an AIExecutionOptions.responseValidator inside
 * AiOrchestrationService's "Validate Response" pipeline step (see
 * ResumeOptimizationService.run()), so any throw here triggers the same
 * automatic credit refund as any other pipeline failure — this parser never
 * touches credits or the ledger itself.
 */
export class ResumeOptimizationResponseParser {
  static parse(rawText: string): ParsedOptimizationResponse {
    const data = this.parseJson(rawText);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new InvalidPromptError('AI response must be a JSON object.');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) {
      throw new InvalidPromptError('AI response is missing a non-empty "summary" string.');
    }
    if (typeof obj.predictedScore !== 'number' || Number.isNaN(obj.predictedScore)) {
      throw new InvalidPromptError('AI response is missing a numeric "predictedScore".');
    }
    if (obj.predictedScore < 0 || obj.predictedScore > 100) {
      throw new InvalidPromptError('AI response "predictedScore" must be between 0 and 100.');
    }
    if (!Array.isArray(obj.suggestions)) {
      throw new InvalidPromptError('AI response is missing a "suggestions" array.');
    }
    if (obj.suggestions.length === 0) {
      throw new InvalidPromptError('AI response "suggestions" array must not be empty.');
    }

    const suggestions = obj.suggestions.map((item, index) => this.parseSuggestion(item, index));

    return {
      summary: obj.summary.trim(),
      predictedScore: Math.round(obj.predictedScore),
      suggestions,
    };
  }

  private static parseJson(rawText: string): unknown {
    try {
      return JSON.parse(rawText);
    } catch {
      throw new InvalidPromptError('AI response is not valid JSON.');
    }
  }

  private static parseSuggestion(item: unknown, index: number): ParsedSuggestion {
    if (typeof item !== 'object' || item === null) {
      throw new InvalidPromptError(`suggestions[${index}] must be an object.`);
    }
    const s = item as Record<string, unknown>;

    if (typeof s.type !== 'string' || !SUGGESTION_TYPES.has(s.type)) {
      throw new InvalidPromptError(
        `suggestions[${index}].type must be one of: ${[...SUGGESTION_TYPES].join(', ')}.`,
      );
    }
    if (typeof s.section !== 'string' || s.section.trim().length === 0) {
      throw new InvalidPromptError(`suggestions[${index}].section must be a non-empty string.`);
    }
    if (typeof s.priority !== 'string' || !SUGGESTION_PRIORITIES.has(s.priority)) {
      throw new InvalidPromptError(
        `suggestions[${index}].priority must be one of: ${[...SUGGESTION_PRIORITIES].join(', ')}.`,
      );
    }
    if (typeof s.title !== 'string' || s.title.trim().length === 0) {
      throw new InvalidPromptError(`suggestions[${index}].title must be a non-empty string.`);
    }
    if (typeof s.reason !== 'string' || s.reason.trim().length === 0) {
      throw new InvalidPromptError(`suggestions[${index}].reason must be a non-empty string.`);
    }
    if (typeof s.originalText !== 'string') {
      throw new InvalidPromptError(
        `suggestions[${index}].originalText must be a string (use "" for a new addition).`,
      );
    }
    if (typeof s.suggestedText !== 'string' || s.suggestedText.trim().length === 0) {
      throw new InvalidPromptError(
        `suggestions[${index}].suggestedText must be a non-empty string.`,
      );
    }

    return {
      type: s.type as SuggestionType,
      section: s.section.trim(),
      priority: s.priority as SuggestionPriority,
      title: s.title.trim(),
      reason: s.reason.trim(),
      originalText: s.originalText,
      suggestedText: s.suggestedText.trim(),
    };
  }
}
