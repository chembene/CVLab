import { Injectable } from '@nestjs/common';
import type { QuestionCategory } from '@prisma/client';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { PromptHash } from '../ai-orchestration/prompt/prompt-hash.util';
import { buildArrayCountInstruction } from '../ai-orchestration/prompt/array-count-instruction.util';
import {
  PromptBuilder,
  type PromptContext,
  type PromptResult,
} from '../ai-orchestration/interfaces/prompt.interface';

/** The current revision of each mode's prompt — bump independently when that mode's rendered text or JSON contract changes, per docs/architecture/ai-orchestration.md §3 (Prompt Version). All 3 start at 1 — the rendered text is identical across modes (see the class doc comment below), only the AIFeature/price differs. */
const RESUME_PROMPT_VERSION = 1;
const JOB_PROMPT_VERSION = 1;
const ROLE_PROMPT_VERSION = 1;

export interface InterviewAnswerToEvaluate {
  order: number;
  category: QuestionCategory;
  question: string;
  idealAnswer: string;
  answer: string;
}

export interface InterviewEvaluationPromptInput {
  language: string;
  items: InterviewAnswerToEvaluate[];
}

/**
 * Shared by all 3 modes — the AI evaluates a question/idealAnswer/answer
 * triple purely on its own terms; it never needed résumé, Job Target, or
 * role/industry context in the first place (see
 * InterviewEvaluationPromptInput above, unchanged since Phase 9), so Modes
 * JOB/ROLE need no rendering changes at all here — only their own AIFeature
 * key (and price) differ from RESUME. See InterviewService.evaluate().
 */
function renderEvaluationPrompt(input: InterviewEvaluationPromptInput): string {
  const { language, items } = input;

  const qaBlock = items
    .map((item) =>
      [
        `${item.order}. Category: ${item.category}`,
        `   Question: ${item.question}`,
        `   Ideal answer: ${item.idealAnswer}`,
        `   Candidate's answer: ${item.answer}`,
      ].join('\n'),
    )
    .join('\n\n');

  return [
    "You are an experienced interviewer evaluating a candidate's answers from a mock interview.",
    `Evaluate each of the ${items.length} answers below against its question and ideal answer. Respond in ${language}.`,
    '',
    '## Questions and answers',
    qaBlock,
    '',
    '## Desired output',
    'Respond with JSON ONLY — no markdown, no prose outside the JSON object. The JSON object must match exactly this shape, with "evaluations" in the SAME ORDER as the questions above (position, not category, decides the match):',
    JSON.stringify(
      {
        evaluations: [
          {
            score: 'number — 0 to 100',
            feedback: 'string — specific, constructive feedback on this answer',
            strengths: ['string — a specific strength of this answer'],
            improvements: ['string — a specific way to improve this answer'],
          },
        ],
      },
      null,
      2,
    ),
    buildArrayCountInstruction(items.length),
  ].join('\n');
}

/**
 * Step 3's prompt builder (docs/architecture/interview-engine.md §5) — one
 * class per mode, each registered into AI Orchestration's PromptRegistry
 * under its own AIFeature key (RESUME/JOB/ROLE genuinely have different
 * price points — see ai-feature.enum.ts), all 3 delegating to the shared,
 * mode-agnostic render function above. Renders every question/idealAnswer/
 * answer triple in the session, numbered, and asks for one JSON array of
 * evaluations in the same order — matched back to questions by array
 * position, never by asking the AI to echo back a database id (which a real
 * provider could hallucinate). See InterviewService.evaluate().
 */
@Injectable()
export class InterviewEvaluationPromptBuilder extends PromptBuilder<InterviewEvaluationPromptInput> {
  readonly metadata = { feature: AIFeature.INTERVIEW_EVALUATION, version: RESUME_PROMPT_VERSION };

  build(context: PromptContext<InterviewEvaluationPromptInput>): PromptResult {
    const text = renderEvaluationPrompt(context.input);
    return {
      text,
      version: RESUME_PROMPT_VERSION,
      hash: PromptHash.generate(text),
      metadata: this.metadata,
    };
  }
}

@Injectable()
export class JobInterviewEvaluationPromptBuilder extends PromptBuilder<InterviewEvaluationPromptInput> {
  readonly metadata = { feature: AIFeature.INTERVIEW_EVALUATION_JOB, version: JOB_PROMPT_VERSION };

  build(context: PromptContext<InterviewEvaluationPromptInput>): PromptResult {
    const text = renderEvaluationPrompt(context.input);
    return {
      text,
      version: JOB_PROMPT_VERSION,
      hash: PromptHash.generate(text),
      metadata: this.metadata,
    };
  }
}

@Injectable()
export class RoleInterviewEvaluationPromptBuilder extends PromptBuilder<InterviewEvaluationPromptInput> {
  readonly metadata = {
    feature: AIFeature.INTERVIEW_EVALUATION_ROLE,
    version: ROLE_PROMPT_VERSION,
  };

  build(context: PromptContext<InterviewEvaluationPromptInput>): PromptResult {
    const text = renderEvaluationPrompt(context.input);
    return {
      text,
      version: ROLE_PROMPT_VERSION,
      hash: PromptHash.generate(text),
      metadata: this.metadata,
    };
  }
}
