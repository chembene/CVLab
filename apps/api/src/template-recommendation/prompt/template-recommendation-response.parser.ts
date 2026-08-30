import { InvalidPromptError } from '../../ai-orchestration/errors/invalid-prompt.error';
import type { TemplateRecommendationItem } from '../interfaces/template-recommendation-context.interface';

export interface ParsedTemplateRecommendationResponse {
  summary: string;
  templateRecommendations: TemplateRecommendationItem[];
}

/**
 * Validates and parses the AI provider's raw JSON text into a strictly-typed
 * ParsedTemplateRecommendationResponse. Runs as an
 * AIExecutionOptions.responseValidator inside AiOrchestrationService's
 * "Validate Response" pipeline step (see
 * TemplateRecommendationService.recommend()), so any throw here triggers the
 * same automatic credit refund as any other pipeline failure — this parser
 * never touches credits or the ledger itself.
 *
 * Deliberately SHAPE-only: this parser has no knowledge of which
 * `templateId`s actually exist — that is a data-access concern the static
 * parser should never own. Cross-checking each id against the real
 * ResumeTemplate catalog (and re-ranking after dropping any that don't
 * exist) happens one layer up, in
 * TemplateRecommendationService.validateTemplateIds() — see
 * template-recommendation-engine.md §2.
 *
 * Reads `templateRecommendations`, not `recommendations` — see
 * TemplateRecommendationPromptBuilder's doc comment for why (avoids
 * colliding with DummyAIProvider's existing `recommendations: string[]`
 * field, Career Advisor's).
 */
export class TemplateRecommendationResponseParser {
  static parse(rawText: string): ParsedTemplateRecommendationResponse {
    const data = this.parseJson(rawText);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new InvalidPromptError('AI response must be a JSON object.');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) {
      throw new InvalidPromptError('AI response is missing a non-empty "summary" string.');
    }
    if (!Array.isArray(obj.templateRecommendations)) {
      throw new InvalidPromptError('AI response is missing a "templateRecommendations" array.');
    }
    if (obj.templateRecommendations.length === 0) {
      throw new InvalidPromptError(
        'AI response "templateRecommendations" array must not be empty.',
      );
    }

    return {
      summary: obj.summary.trim(),
      templateRecommendations: obj.templateRecommendations.map((item, index) =>
        this.parseItem(item, index),
      ),
    };
  }

  private static parseItem(item: unknown, index: number): TemplateRecommendationItem {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new InvalidPromptError(`templateRecommendations[${index}] must be an object.`);
    }
    const r = item as Record<string, unknown>;

    if (typeof r.templateId !== 'string' || r.templateId.trim().length === 0) {
      throw new InvalidPromptError(
        `templateRecommendations[${index}].templateId must be a non-empty string.`,
      );
    }
    if (typeof r.rank !== 'number' || !Number.isFinite(r.rank) || r.rank < 1) {
      throw new InvalidPromptError(`templateRecommendations[${index}].rank must be a number >= 1.`);
    }
    if (typeof r.score !== 'number' || !Number.isFinite(r.score) || r.score < 0 || r.score > 100) {
      throw new InvalidPromptError(
        `templateRecommendations[${index}].score must be a number between 0 and 100.`,
      );
    }
    if (typeof r.reason !== 'string' || r.reason.trim().length === 0) {
      throw new InvalidPromptError(
        `templateRecommendations[${index}].reason must be a non-empty string.`,
      );
    }

    return {
      templateId: r.templateId.trim(),
      rank: Math.round(r.rank),
      score: Math.round(r.score),
      reason: r.reason.trim(),
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
