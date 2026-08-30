import { SuggestionPriority } from '@prisma/client';
import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';
import type { AtsAiRecommendation } from '../interfaces/ats-ai-context.interface';

export interface ParsedAtsAiResponse {
  overallAssessment: string;
  strengths: string[];
  priorityIssues: AtsAiRecommendation[];
  contentRecommendations: AtsAiRecommendation[];
  sectionRecommendations: AtsAiRecommendation[];
  actionPlan: string[];
}

const PRIORITIES = new Set<string>(Object.values(SuggestionPriority));

/**
 * Validates and parses the AI provider's raw JSON text into a strictly-typed
 * ParsedAtsAiResponse. Runs as an AIExecutionOptions.responseValidator
 * inside AiOrchestrationService's "Validate Response" pipeline step (see
 * AtsAiService.analyze()), so any throw here triggers the same automatic
 * credit refund as any other pipeline failure — this parser never touches
 * credits or the ledger itself. Mirrors CareerAdvisorResponseParser's (FASE
 * 18) structure for the top-level fields, and
 * ResumeOptimizationResponseParser's per-item validation style (reusing the
 * same `SuggestionPriority` enum/vocabulary, per-item) for the 3
 * recommendation arrays.
 */
export class AtsAiResponseParser {
  static parse(rawText: string): ParsedAtsAiResponse {
    const data = this.parseJson(rawText);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new InvalidPromptError('AI response must be a JSON object.');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.overallAssessment !== 'string' || obj.overallAssessment.trim().length === 0) {
      throw new InvalidPromptError(
        'AI response is missing a non-empty "overallAssessment" string.',
      );
    }

    return {
      overallAssessment: obj.overallAssessment.trim(),
      strengths: this.parseStringArray(obj.strengths, 'strengths'),
      priorityIssues: this.parseRecommendationArray(obj.priorityIssues, 'priorityIssues'),
      contentRecommendations: this.parseRecommendationArray(
        obj.contentRecommendations,
        'contentRecommendations',
      ),
      sectionRecommendations: this.parseRecommendationArray(
        obj.sectionRecommendations,
        'sectionRecommendations',
      ),
      actionPlan: this.parseStringArray(obj.actionPlan, 'actionPlan'),
    };
  }

  /** Empty arrays are valid (e.g. "strengths" with a very low score) — only a non-array, or an array containing a non-string, is malformed. */
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

  private static parseRecommendationArray(value: unknown, field: string): AtsAiRecommendation[] {
    if (!Array.isArray(value)) {
      throw new InvalidPromptError(`AI response is missing a "${field}" array.`);
    }
    return value.map((item, index) => this.parseRecommendation(item, field, index));
  }

  private static parseRecommendation(
    item: unknown,
    field: string,
    index: number,
  ): AtsAiRecommendation {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new InvalidPromptError(`"${field}[${index}]" must be an object.`);
    }
    const r = item as Record<string, unknown>;

    if (typeof r.priority !== 'string' || !PRIORITIES.has(r.priority)) {
      throw new InvalidPromptError(
        `"${field}[${index}].priority" must be one of: ${[...PRIORITIES].join(', ')}.`,
      );
    }
    if (typeof r.category !== 'string' || r.category.trim().length === 0) {
      throw new InvalidPromptError(`"${field}[${index}].category" must be a non-empty string.`);
    }
    if (typeof r.explanation !== 'string' || r.explanation.trim().length === 0) {
      throw new InvalidPromptError(`"${field}[${index}].explanation" must be a non-empty string.`);
    }
    if (typeof r.recommendation !== 'string' || r.recommendation.trim().length === 0) {
      throw new InvalidPromptError(
        `"${field}[${index}].recommendation" must be a non-empty string.`,
      );
    }

    return {
      priority: r.priority as SuggestionPriority,
      category: r.category.trim(),
      explanation: r.explanation.trim(),
      recommendation: r.recommendation.trim(),
    };
  }

  private static parseJson(rawText: string): unknown {
    try {
      return JSON.parse(rawText);
    } catch {
      throw new InvalidPromptError('AI response is not valid JSON.');
    }
  }
}
