import { Injectable } from '@nestjs/common';
import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import { PromptHash } from '../../ai-orchestration/prompt/prompt-hash.util';
import {
  PromptBuilder,
  type PromptContext,
  type PromptResult,
} from '../../ai-orchestration/interfaces/prompt.interface';
import type { LinkedInProfileContext } from '../interfaces/linkedin-profile-context.interface';

/** The current revision of this prompt — bump when the rendered text or the JSON contract it asks for changes, per docs/architecture/ai-orchestration.md §3 (Prompt Version). */
const PROMPT_VERSION = 1;

export interface LinkedInPromptInput {
  /** Optional, free-text — the role the generated profile should be angled toward. Falls back to the most recent Job Target when absent. */
  targetRole: string | null;
  context: LinkedInProfileContext;
}

/**
 * Registered into AI Orchestration's PromptRegistry (FASE 19), following the
 * exact structural pattern CareerAdvisorPromptBuilder (FASE 18) and
 * CoverLetterPromptBuilder (Phase 8) established: an ordered list of
 * optional markdown sections, each filtered out entirely when its data is
 * absent, ending in an explicit JSON-only response contract. Turns the
 * user's Master Resume/experience/education/skills into LinkedIn-flavored
 * content — a headline, an "About" summary, suggested skills, rewritten
 * experience bullets, and general profile-improvement recommendations —
 * never fabricating facts, qualifications, employers, or achievements not
 * present in the data below.
 */
@Injectable()
export class LinkedInPromptBuilder extends PromptBuilder<LinkedInPromptInput> {
  readonly metadata = { feature: AIFeature.LINKEDIN, version: PROMPT_VERSION };

  build(context: PromptContext<LinkedInPromptInput>): PromptResult {
    const { targetRole, context: ctx } = context.input;

    const hasAnyData =
      ctx.profile !== null ||
      ctx.masterResume !== null ||
      ctx.workExperience.length > 0 ||
      ctx.education.length > 0 ||
      ctx.skills.length > 0 ||
      ctx.jobTargets.length > 0;

    const text = [
      'You are a professional LinkedIn profile writer and career branding expert.',
      'Turn the candidate data below into polished, professional LinkedIn profile content.',
      'NEVER invent facts, qualifications, employers, degrees, certifications, or achievements that are not present in the data below — you may rephrase and reframe existing wording, but never add new claims.',
      'Write in a professional, confident, first-person tone appropriate for a LinkedIn profile — not overly casual, not a résumé restated verbatim.',
      'If the data below is sparse or missing, say so plainly in the recommendations, and still produce the best possible general content from what is available — never leave a field empty by fabricating instead.',
      '',
      '## Target role',
      targetRole
        ? targetRole
        : '(not specified — infer a sensible target from the data below, or keep the content general if nothing suggests one)',
      '',
      hasAnyData
        ? '## Available candidate data'
        : '## Available candidate data\n(none — the candidate has not filled in any profile, resume, or job target data yet. Acknowledge this in the recommendations and produce only general, non-fabricated content.)',

      ctx.profile
        ? [
            '### 1. Professional profile',
            `Name: ${[ctx.profile.firstName, ctx.profile.lastName].filter(Boolean).join(' ') || '(not provided)'}`,
            ctx.profile.headline ? `Current headline: ${ctx.profile.headline}` : undefined,
            ctx.profile.city || ctx.profile.country
              ? `Location: ${[ctx.profile.city, ctx.profile.country].filter(Boolean).join(', ')}`
              : undefined,
          ]
            .filter((l): l is string => l !== undefined)
            .join('\n')
        : undefined,

      ctx.masterResume
        ? [
            '### 2. Master Resume',
            ctx.masterResume.title ? `Title: ${ctx.masterResume.title}` : undefined,
            ctx.masterResume.summary ? `Summary: ${ctx.masterResume.summary}` : undefined,
            ctx.masterResume.careerLevel
              ? `Career level: ${ctx.masterResume.careerLevel}`
              : undefined,
            ctx.masterResume.yearsExperience != null
              ? `Years of experience: ${ctx.masterResume.yearsExperience}`
              : undefined,
            ctx.masterResume.desiredPosition
              ? `Desired position: ${ctx.masterResume.desiredPosition}`
              : undefined,
          ]
            .filter((l): l is string => l !== undefined)
            .join('\n')
        : undefined,

      ctx.workExperience.length > 0
        ? [
            '### 3. Professional experience (current wording, to rephrase — never fabricate new ones)',
            ...ctx.workExperience.map((w) =>
              [
                `- ${w.position} at ${w.company}${w.currentlyWorking ? ' (current)' : ''}`,
                w.description ? `  Description: ${w.description}` : undefined,
                w.achievements.length > 0
                  ? `  Achievements: ${w.achievements.join('; ')}`
                  : undefined,
              ]
                .filter((l): l is string => l !== undefined)
                .join('\n'),
            ),
          ].join('\n')
        : undefined,

      ctx.education.length > 0
        ? [
            '### 4. Education',
            ...ctx.education.map(
              (e) =>
                `- ${[e.degree, e.field].filter(Boolean).join(' in ') || 'Studies'} — ${e.institution}`,
            ),
          ].join('\n')
        : undefined,

      ctx.skills.length > 0
        ? [
            '### 5. Skills',
            ...ctx.skills.map((s) => `- ${s.name}${s.level ? ` (${s.level})` : ''}`),
          ].join('\n')
        : undefined,

      ctx.jobTargets.length > 0
        ? [
            '### 6. Job targets',
            ...ctx.jobTargets.map((j) => `- ${j.title}${j.company ? ` at ${j.company}` : ''}`),
          ].join('\n')
        : undefined,

      '',
      '## Desired output',
      'Respond with JSON ONLY — no markdown, no prose outside the JSON object. The JSON object must match exactly this shape:',
      JSON.stringify(
        {
          headline:
            'string — a short, keyword-rich LinkedIn headline (under ~220 characters), based only on the data given',
          about:
            'string — a first-person "About" section, 3-5 short paragraphs, based only on the data given',
          skills:
            'string[] — suggested LinkedIn skills to list, drawn from (or clearly implied by) the data given',
          experienceSuggestions:
            "string[] — rewritten/polished versions of the candidate's own experience bullets, one string per suggestion — never inventing new roles or achievements",
          recommendations:
            'string[] — general, actionable suggestions for improving the LinkedIn profile itself (e.g. missing sections, sparse data, what to add) — acknowledge missing data here instead of guessing',
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
