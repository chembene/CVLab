import { Injectable } from '@nestjs/common';
import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import { PromptHash } from '../../ai-orchestration/prompt/prompt-hash.util';
import {
  PromptBuilder,
  type PromptContext,
  type PromptResult,
} from '../../ai-orchestration/interfaces/prompt.interface';
import type { AtsAiContext } from '../interfaces/ats-ai-context.interface';

/** The current revision of this prompt — bump when the rendered text or the JSON contract it asks for changes, per docs/architecture/ai-orchestration.md §3 (Prompt Version). */
const PROMPT_VERSION = 1;

export interface AtsAiPromptInput {
  context: AtsAiContext;
}

/**
 * Registered into AI Orchestration's PromptRegistry (FASE 20), following the
 * exact structural pattern CareerAdvisorPromptBuilder (FASE 18)/
 * LinkedInPromptBuilder (FASE 19) established. Turns an already-computed,
 * deterministic AtsReport (Phase 4 — never recalculated here) into a
 * prioritized, explained, actionable interpretation. Renders only what
 * AtsReport/JobTarget already persist — no keyword matching, scoring, or
 * formatting/section detection is redone; the model is asked to explain and
 * prioritize the numbers it's given, never to recompute them.
 */
@Injectable()
export class AtsAiPromptBuilder extends PromptBuilder<AtsAiPromptInput> {
  readonly metadata = { feature: AIFeature.ATS_AI, version: PROMPT_VERSION };

  build(context: PromptContext<AtsAiPromptInput>): PromptResult {
    const { atsReport, jobTarget, resume } = context.input.context;

    const text = [
      'You are an expert ATS (Applicant Tracking System) consultant.',
      'The scores and keyword/skill matches below were already computed by a deterministic, rule-based ATS engine — NEVER recompute, contradict, or invent different numbers. Your job is to interpret these existing results, explain what they mean in practice, prioritize what matters most, and give concrete, actionable guidance.',
      'NEVER invent facts, qualifications, employers, or resume content not implied by the data below.',
      'Be direct and specific — reference the actual missing keywords/skills by name in your explanations, not vague generalities.',
      '',
      '## Résumé being evaluated',
      `Title: ${resume.title}`,
      '',
      '## Job target',
      `Title: ${jobTarget.title}`,
      jobTarget.company ? `Company: ${jobTarget.company}` : undefined,
      jobTarget.seniority ? `Seniority: ${jobTarget.seniority}` : undefined,
      `Required/desired keywords: ${jobTarget.keywords.join(', ') || '(none)'}`,
      `Required/desired skills: ${jobTarget.skills.join(', ') || '(none)'}`,
      `Languages: ${jobTarget.languages.join(', ') || '(none)'}`,
      '',
      '## Deterministic ATS report (already computed — do not recalculate)',
      `Overall score: ${atsReport.overallScore}/100`,
      `Keyword score: ${atsReport.keywordScore}, Skills score: ${atsReport.skillsScore}, Experience score: ${atsReport.experienceScore}, Education score: ${atsReport.educationScore}, Language score: ${atsReport.languageScore}, Formatting score: ${atsReport.formattingScore}, Completion score: ${atsReport.completionScore}`,
      `Matched keywords: ${atsReport.matchedKeywords.join(', ') || '(none)'}`,
      `Missing keywords: ${atsReport.missingKeywords.join(', ') || '(none)'}`,
      `Recommended/missing skills: ${atsReport.recommendedSkills.join(', ') || '(none)'}`,
      `Rule-based recommendations already generated: ${atsReport.recommendations.join('; ') || '(none)'}`,
      '',
      '## Desired output',
      'Respond with JSON ONLY — no markdown, no prose outside the JSON object. The JSON object must match exactly this shape:',
      JSON.stringify(
        {
          overallAssessment:
            'string — a direct, honest summary of where this résumé stands against this job target',
          strengths:
            'string[] — concrete strengths visible in the data (empty array if the score is too low to identify any)',
          priorityIssues: [
            {
              priority: 'one of LOW | MEDIUM | HIGH | CRITICAL',
              category: 'string — e.g. "Keywords", "Skills", "Formatting", "Experience"',
              explanation: 'string — why this matters, referencing the actual data above',
              recommendation: 'string — the specific action to take',
            },
          ],
          contentRecommendations:
            '[{priority, category, explanation, recommendation}, ...] — wording/content-level suggestions (e.g. which missing keywords to weave in and where)',
          sectionRecommendations:
            '[{priority, category, explanation, recommendation}, ...] — structural/section-level suggestions (e.g. a section that is weak or missing)',
          actionPlan: 'string[] — an ordered, concrete list of next steps, most impactful first',
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
