import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';
import type { CvImportAiSection, CvImportAiSuggestion } from '../interfaces/cv-import-ai.interface';

export interface ParsedCvImportAiResponse {
  suggestions: CvImportAiSuggestion[];
  unresolvedFields: string[];
}

const SECTIONS = new Set<CvImportAiSection>([
  'personalData',
  'summary',
  'workExperiences',
  'educations',
  'skills',
  'languages',
  'certificates',
  'projects',
  'awards',
  'volunteerExperiences',
  'references',
]);

/**
 * Validates and parses the AI provider's raw JSON text into a strictly-typed
 * ParsedCvImportAiResponse. Runs as an AIExecutionOptions.responseValidator
 * inside AiOrchestrationService's "Validate Response" pipeline step (see
 * CvImportService.enhanceWithAi()), so any throw here triggers the same
 * automatic credit refund as any other pipeline failure. Deliberately
 * SHAPE-only — it has no knowledge of which fields actually exist in a given
 * draft (that cross-check, and the "never invent" enforcement, is
 * `validateCvImportAiSuggestions()`'s job in cv-import-ai-validator.ts, run
 * separately by the service after this parser succeeds). Reads the raw
 * JSON's `fieldSuggestions` key (see CvImportPromptBuilder's doc comment for
 * why it isn't named `suggestions`) but exposes it as `.suggestions` on the
 * parsed, internal result type — this feature's own DB column/frontend type
 * are free to use the clearer name since the collision only exists at the
 * shared-envelope wire level.
 */
export class CvImportResponseParser {
  static parse(rawText: string): ParsedCvImportAiResponse {
    const data = this.parseJson(rawText);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new InvalidPromptError('AI response must be a JSON object.');
    }
    const obj = data as Record<string, unknown>;

    return {
      suggestions: this.parseSuggestions(obj.fieldSuggestions),
      unresolvedFields: this.parseStringArray(obj.unresolvedFields, 'unresolvedFields'),
    };
  }

  /** Empty is valid — a clean draft with nothing worth revising. Only a non-array, or a malformed item, is rejected. */
  private static parseSuggestions(value: unknown): CvImportAiSuggestion[] {
    if (!Array.isArray(value)) {
      throw new InvalidPromptError('AI response is missing a "fieldSuggestions" array.');
    }
    return value.map((item, index) => this.parseSuggestion(item, index));
  }

  private static parseSuggestion(item: unknown, index: number): CvImportAiSuggestion {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new InvalidPromptError(`"fieldSuggestions[${index}]" must be an object.`);
    }
    const s = item as Record<string, unknown>;

    if (typeof s.section !== 'string' || !SECTIONS.has(s.section as CvImportAiSection)) {
      throw new InvalidPromptError(
        `"fieldSuggestions[${index}].section" must be one of: ${[...SECTIONS].join(', ')}.`,
      );
    }
    if (s.index !== undefined && (typeof s.index !== 'number' || s.index < 0)) {
      throw new InvalidPromptError(
        `"fieldSuggestions[${index}].index" must be a non-negative number.`,
      );
    }
    if (typeof s.field !== 'string' || s.field.trim().length === 0) {
      throw new InvalidPromptError(
        `"fieldSuggestions[${index}].field" must be a non-empty string.`,
      );
    }
    if (typeof s.suggestedValue !== 'string' || s.suggestedValue.trim().length === 0) {
      throw new InvalidPromptError(
        `"fieldSuggestions[${index}].suggestedValue" must be a non-empty string.`,
      );
    }
    if (typeof s.reason !== 'string' || s.reason.trim().length === 0) {
      throw new InvalidPromptError(
        `"fieldSuggestions[${index}].reason" must be a non-empty string.`,
      );
    }
    if (typeof s.confidence !== 'number' || s.confidence < 0 || s.confidence > 1) {
      throw new InvalidPromptError(
        `"fieldSuggestions[${index}].confidence" must be a number between 0 and 1.`,
      );
    }

    return {
      section: s.section as CvImportAiSection,
      index: s.index as number | undefined,
      field: s.field.trim(),
      // Placeholder — never trusted; validateCvImportAiSuggestions() always
      // overwrites this with the real current value before persistence.
      originalValue: typeof s.originalValue === 'string' ? s.originalValue.trim() : '',
      suggestedValue: s.suggestedValue.trim(),
      reason: s.reason.trim(),
      confidence: Math.max(0, Math.min(1, Math.round(s.confidence * 100) / 100)),
    };
  }

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
