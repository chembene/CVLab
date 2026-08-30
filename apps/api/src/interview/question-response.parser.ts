import { QuestionCategory } from '@prisma/client';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';

export interface ParsedQuestion {
  category: QuestionCategory;
  question: string;
  idealAnswer: string;
  tips: string;
}

const QUESTION_CATEGORIES = new Set<string>(Object.values(QuestionCategory));

/**
 * Validates and parses the AI provider's raw JSON text for Step 1 (question
 * generation) into strictly-typed data — "Validate JSON, required fields,
 * types. Throw InvalidPromptError when malformed," mirroring
 * ResumeOptimizationResponseParser (Phase 7) and CoverLetterResponseParser
 * (Phase 8) exactly. Runs as an AIExecutionOptions.responseValidator inside
 * AiOrchestrationService's "Validate Response" pipeline step (see
 * InterviewService.generateQuestions()), so a throw here triggers the same
 * automatic credit refund as any other pipeline failure.
 */
export class QuestionResponseParser {
  static parse(rawText: string): ParsedQuestion[] {
    const data = this.parseJson(rawText);

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new InvalidPromptError('AI response must be a JSON object.');
    }
    const obj = data as Record<string, unknown>;

    if (!Array.isArray(obj.questions)) {
      throw new InvalidPromptError('AI response is missing a "questions" array.');
    }
    if (obj.questions.length === 0) {
      throw new InvalidPromptError('AI response "questions" array must not be empty.');
    }

    return obj.questions.map((item, index) => this.parseQuestion(item, index));
  }

  private static parseJson(rawText: string): unknown {
    try {
      return JSON.parse(rawText);
    } catch {
      throw new InvalidPromptError('AI response is not valid JSON.');
    }
  }

  private static parseQuestion(item: unknown, index: number): ParsedQuestion {
    if (typeof item !== 'object' || item === null) {
      throw new InvalidPromptError(`questions[${index}] must be an object.`);
    }
    const q = item as Record<string, unknown>;

    if (typeof q.category !== 'string' || !QUESTION_CATEGORIES.has(q.category)) {
      throw new InvalidPromptError(
        `questions[${index}].category must be one of: ${[...QUESTION_CATEGORIES].join(', ')}.`,
      );
    }
    if (typeof q.question !== 'string' || q.question.trim().length === 0) {
      throw new InvalidPromptError(`questions[${index}].question must be a non-empty string.`);
    }
    if (typeof q.idealAnswer !== 'string' || q.idealAnswer.trim().length === 0) {
      throw new InvalidPromptError(`questions[${index}].idealAnswer must be a non-empty string.`);
    }
    if (typeof q.tips !== 'string' || q.tips.trim().length === 0) {
      throw new InvalidPromptError(`questions[${index}].tips must be a non-empty string.`);
    }

    return {
      category: q.category as QuestionCategory,
      question: q.question.trim(),
      idealAnswer: q.idealAnswer.trim(),
      tips: q.tips.trim(),
    };
  }
}
