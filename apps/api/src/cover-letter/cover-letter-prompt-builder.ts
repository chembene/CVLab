import { Injectable } from '@nestjs/common';
import type { AtsReport, CoverLetterTone } from '@prisma/client';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import { PromptHash } from '../ai-orchestration/prompt/prompt-hash.util';
import {
  PromptBuilder,
  type PromptContext,
  type PromptResult,
} from '../ai-orchestration/interfaces/prompt.interface';
import type { JobTargetWithChildren } from '../job-target/job-target.repository';

/** The current revision of this prompt — bump when the rendered text or the JSON contract it asks for changes, per docs/architecture/ai-orchestration.md §3 (Prompt Version). */
const PROMPT_VERSION = 1;

export interface CoverLetterPromptInput {
  resumeContent: Record<string, unknown>;
  jobTarget: JobTargetWithChildren;
  atsReport: AtsReport;
  /** ResumeOptimization.summary, when an optimizationId was supplied — omitted from the prompt entirely when absent, never a fabricated placeholder. */
  optimizationSummary?: string | null;
  tone: CoverLetterTone;
  language: string;
}

/**
 * The second feature builder registered into AI Orchestration's
 * PromptRegistry (Phase 8, following ResumeOptimizationPromptBuilder from
 * Phase 7's pattern exactly). Renders the Resume Variant, its linked Job
 * Target, the latest ATS Report, an optional Resume Optimization summary,
 * and the requested tone/language into one JSON-only prompt.
 */
@Injectable()
export class CoverLetterPromptBuilder extends PromptBuilder<CoverLetterPromptInput> {
  readonly metadata = { feature: AIFeature.COVER_LETTER, version: PROMPT_VERSION };

  build(context: PromptContext<CoverLetterPromptInput>): PromptResult {
    const { resumeContent, jobTarget, atsReport, optimizationSummary, tone, language } =
      context.input;

    const text = [
      'You are a professional cover letter writer.',
      'Write a compelling, personalized cover letter for the candidate below, tailored to the job target.',
      '',
      '## Resume Variant (JSON)',
      JSON.stringify(resumeContent),
      '',
      '## Job Target',
      `Title: ${jobTarget.title}`,
      jobTarget.company ? `Company: ${jobTarget.company}` : undefined,
      jobTarget.seniority ? `Seniority: ${jobTarget.seniority}` : undefined,
      `Required/desired keywords: ${jobTarget.keywords.map((k) => k.keyword).join(', ') || '(none)'}`,
      `Required/desired skills: ${jobTarget.skills.map((s) => `${s.skill}${s.required ? ' (required)' : ''}`).join(', ') || '(none)'}`,
      '',
      '## ATS Report (current state)',
      `Current overall score: ${atsReport.overallScore}/100`,
      `Missing keywords: ${atsReport.missingKeywords.join(', ') || '(none)'}`,
      `Missing/recommended skills: ${atsReport.recommendedSkills.join(', ') || '(none)'}`,
      '',
      '## Resume Optimization Summary',
      optimizationSummary ? optimizationSummary : '(none available)',
      '',
      '## Desired tone',
      tone,
      '',
      '## Desired language',
      language,
      '',
      '## Desired output',
      'Respond with JSON ONLY — no markdown, no prose outside the JSON object. The JSON object must match exactly this shape:',
      JSON.stringify(
        {
          title:
            'string — a short title for this cover letter, e.g. "Cover Letter — Senior Backend Engineer"',
          coverLetter:
            'string — the full cover letter body, written in the requested language and tone',
          summary: 'string — a one-sentence summary of the angle this letter takes',
        },
        null,
        2,
      ),
    ]
      .filter((line): line is string => line !== undefined)
      .join('\n');

    return {
      text,
      version: PROMPT_VERSION,
      hash: PromptHash.generate(text),
      metadata: this.metadata,
    };
  }
}
