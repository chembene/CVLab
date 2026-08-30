import { Injectable } from '@nestjs/common';
import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import { PromptHash } from '../../ai-orchestration/prompt/prompt-hash.util';
import {
  PromptBuilder,
  type PromptContext,
  type PromptResult,
} from '../../ai-orchestration/interfaces/prompt.interface';
import type { CareerAdviceContext } from '../interfaces/career-advice-context.interface';

/** The current revision of this prompt — bump when the rendered text or the JSON contract it asks for changes, per docs/architecture/ai-orchestration.md §3 (Prompt Version). */
const PROMPT_VERSION = 1;

export interface CareerAdvisorPromptInput {
  question: string;
  context: CareerAdviceContext;
}

/**
 * Registered into AI Orchestration's PromptRegistry (FASE 18), following the
 * exact structural pattern CoverLetterPromptBuilder established (Phase 8):
 * an ordered list of optional markdown sections, each filtered out entirely
 * when its data is absent, ending in an explicit JSON-only response
 * contract. Renders context in the exact priority order the brief specifies
 * (profile → master resume → experience → education → skills → job targets
 * → resume variants → applications → ATS results → interview history) and
 * never fabricates a section that has no data — see "Sem dados" below.
 */
@Injectable()
export class CareerAdvisorPromptBuilder extends PromptBuilder<CareerAdvisorPromptInput> {
  readonly metadata = { feature: AIFeature.CAREER_ADVISOR, version: PROMPT_VERSION };

  build(context: PromptContext<CareerAdvisorPromptInput>): PromptResult {
    const { question, context: ctx } = context.input;

    const hasAnyData =
      ctx.profile !== null ||
      ctx.masterResume !== null ||
      ctx.workExperience.length > 0 ||
      ctx.education.length > 0 ||
      ctx.skills.length > 0 ||
      ctx.jobTargets.length > 0 ||
      ctx.resumeVariants.length > 0 ||
      ctx.applications.length > 0 ||
      ctx.atsReports.length > 0 ||
      ctx.interviewSessions.length > 0;

    const text = [
      'You are a practical, honest career advisor embedded in a career-development platform.',
      'Give specific, actionable, professional advice based ONLY on the candidate data provided below.',
      'NEVER invent facts, qualifications, employers, degrees, certifications, or achievements that are not present in the data below.',
      'Do not adopt a "motivational coach" tone — be direct, specific, and action-oriented.',
      'If the data below is sparse or missing, say so plainly, still give general (non-fabricated) advice, and suggest which additional information would let you give a more precise recommendation.',
      '',
      '## Candidate question',
      question,
      '',
      hasAnyData
        ? '## Available candidate data'
        : '## Available candidate data\n(none — the candidate has not filled in any profile, resume, job target, or history data yet. Acknowledge this and give general advice only.)',

      ctx.profile
        ? [
            '### 1. Professional profile',
            `Name: ${[ctx.profile.firstName, ctx.profile.lastName].filter(Boolean).join(' ') || '(not provided)'}`,
            ctx.profile.headline ? `Headline: ${ctx.profile.headline}` : undefined,
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
            `Profile completion: ${ctx.masterResume.completionPercentage}%`,
          ]
            .filter((l): l is string => l !== undefined)
            .join('\n')
        : undefined,

      ctx.workExperience.length > 0
        ? [
            '### 3. Professional experience',
            ...ctx.workExperience.map(
              (w) => `- ${w.position} at ${w.company}${w.currentlyWorking ? ' (current)' : ''}`,
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
            ...ctx.jobTargets.map(
              (j) => `- ${j.title}${j.company ? ` at ${j.company}` : ''} [${j.status}]`,
            ),
          ].join('\n')
        : undefined,

      ctx.resumeVariants.length > 0
        ? ['### 7. Resume variants', ...ctx.resumeVariants.map((v) => `- ${v.title}`)].join('\n')
        : undefined,

      ctx.applications.length > 0
        ? [
            '### 8. Application history',
            ...ctx.applications.map((a) => `- ${a.jobTargetTitle} [${a.status}]`),
          ].join('\n')
        : undefined,

      ctx.atsReports.length > 0
        ? [
            '### 9. ATS analysis results',
            ...ctx.atsReports.map(
              (r) =>
                `- Overall score ${r.overallScore}/100, ${r.missingKeywordsCount} missing keyword(s)`,
            ),
          ].join('\n')
        : undefined,

      ctx.interviewSessions.length > 0
        ? [
            '### 10. Interview practice history',
            ...ctx.interviewSessions.map(
              (i) => `- Mode ${i.mode}, type ${i.type}, difficulty ${i.difficulty}`,
            ),
          ].join('\n')
        : undefined,

      '',
      '## Desired output',
      'Respond with JSON ONLY — no markdown, no prose outside the JSON object. The JSON object must match exactly this shape:',
      JSON.stringify(
        {
          summary: 'string — a 1-2 sentence direct answer to the candidate question',
          currentAssessment:
            "string — an honest assessment of the candidate's current position, based only on the data given (acknowledge missing data instead of guessing)",
          strengths:
            'string[] — concrete strengths visible in the data (empty array if there is not enough data to identify any)',
          gaps: 'string[] — concrete gaps or risks visible in the data, or in the data itself being incomplete',
          recommendations: 'string[] — specific, actionable recommendations',
          nextSteps: 'string[] — ordered, concrete next actions the candidate can take',
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
