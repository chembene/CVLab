import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

export interface ParsedCoverLetterResponse {
  title: string;
  coverLetter: string;
  summary: string;
}

/**
 * Validates and parses the AI provider's raw JSON text into a strictly-typed
 * ParsedCoverLetterResponse — per this phase's brief: "Validate JSON,
 * required fields, types. Throw InvalidPromptError when malformed." Runs as
 * an AIExecutionOptions.responseValidator inside AiOrchestrationService's
 * "Validate Response" pipeline step (see CoverLetterService.generate()),
 * so any throw here triggers the same automatic credit refund as any other
 * pipeline failure — this parser never touches credits or the ledger itself.
 * Mirrors ResumeOptimizationResponseParser's exact structure (Phase 7).
 */
export class CoverLetterResponseParser {
  static parse(rawText: string): ParsedCoverLetterResponse {
    const data = this.parseJson(rawText);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new InvalidPromptError('AI response must be a JSON object.');
    }
    const obj = data as Record<string, unknown>;

    if (typeof obj.title !== 'string' || obj.title.trim().length === 0) {
      throw new InvalidPromptError('AI response is missing a non-empty "title" string.');
    }
    if (typeof obj.coverLetter !== 'string' || obj.coverLetter.trim().length === 0) {
      throw new InvalidPromptError('AI response is missing a non-empty "coverLetter" string.');
    }
    if (typeof obj.summary !== 'string' || obj.summary.trim().length === 0) {
      throw new InvalidPromptError('AI response is missing a non-empty "summary" string.');
    }

    return {
      title: obj.title.trim(),
      coverLetter: obj.coverLetter.trim(),
      summary: obj.summary.trim(),
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
