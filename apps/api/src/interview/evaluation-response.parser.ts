import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

export interface ParsedEvaluation {
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

/**
 * Validates and parses the AI provider's raw JSON text for Step 3 (answer
 * evaluation) into strictly-typed data. `expectedCount` is the session's
 * actual number of answered questions — passed in explicitly (not inferred
 * from the JSON itself) so a wrong-length response is treated exactly like
 * any other contract violation and rejected with InvalidPromptError, inside
 * the same AIExecutionOptions.responseValidator hook (see
 * InterviewService.evaluate()) that triggers the automatic credit refund.
 */
export class EvaluationResponseParser {
  static parse(rawText: string, expectedCount: number): ParsedEvaluation[] {
    const data = this.parseJson(rawText);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new InvalidPromptError('AI response must be a JSON object.');
    }
    const obj = data as Record<string, unknown>;

    if (!Array.isArray(obj.evaluations)) {
      throw new InvalidPromptError('AI response is missing an "evaluations" array.');
    }
    if (obj.evaluations.length !== expectedCount) {
      throw new InvalidPromptError(
        `AI response "evaluations" array must have exactly ${expectedCount} item(s), got ${obj.evaluations.length}.`,
      );
    }

    return obj.evaluations.map((item, index) => this.parseEvaluation(item, index));
  }

  private static parseJson(rawText: string): unknown {
    try {
      return JSON.parse(rawText);
    } catch {
      throw new InvalidPromptError('AI response is not valid JSON.');
    }
  }

  private static parseEvaluation(item: unknown, index: number): ParsedEvaluation {
    if (typeof item !== 'object' || item === null) {
      throw new InvalidPromptError(`evaluations[${index}] must be an object.`);
    }
    const e = item as Record<string, unknown>;

    if (typeof e.score !== 'number' || Number.isNaN(e.score) || e.score < 0 || e.score > 100) {
      throw new InvalidPromptError(
        `evaluations[${index}].score must be a number between 0 and 100.`,
      );
    }
    if (typeof e.feedback !== 'string' || e.feedback.trim().length === 0) {
      throw new InvalidPromptError(`evaluations[${index}].feedback must be a non-empty string.`);
    }
    if (!Array.isArray(e.strengths) || e.strengths.some((s) => typeof s !== 'string')) {
      throw new InvalidPromptError(`evaluations[${index}].strengths must be an array of strings.`);
    }
    if (!Array.isArray(e.improvements) || e.improvements.some((s) => typeof s !== 'string')) {
      throw new InvalidPromptError(
        `evaluations[${index}].improvements must be an array of strings.`,
      );
    }

    return {
      score: Math.round(e.score),
      feedback: e.feedback.trim(),
      strengths: e.strengths as string[],
      improvements: e.improvements as string[],
    };
  }
}
