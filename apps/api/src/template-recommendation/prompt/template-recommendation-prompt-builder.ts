import { Injectable } from '@nestjs/common';
import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import { PromptHash } from '../../ai-orchestration/prompt/prompt-hash.util';
import {
  PromptBuilder,
  type PromptContext,
  type PromptResult,
} from '../../ai-orchestration/interfaces/prompt.interface';
import type { TemplateRecommendationContext } from '../interfaces/template-recommendation-context.interface';

/** The current revision of this prompt — bump when the rendered text or the JSON contract it asks for changes, per docs/architecture/ai-orchestration.md §3 (Prompt Version). */
const PROMPT_VERSION = 1;
/** "limitar o número de recomendações" — enforced both here (the prompt asks for at most this many) and defensively in the service after parsing (truncated, never rejected, if the model overshoots). */
export const MAX_RECOMMENDATIONS = 5;

export interface TemplateRecommendationPromptInput {
  context: TemplateRecommendationContext;
}

/**
 * Registered into AI Orchestration's PromptRegistry (FASE 21), following the
 * exact structural pattern CareerAdvisorPromptBuilder (FASE 18)/
 * LinkedInPromptBuilder (FASE 19)/AtsAiPromptBuilder (FASE 20) established.
 * Recommends EXISTING ResumeTemplate rows only — the full catalog is
 * rendered into the prompt with each template's real id, and the model is
 * explicitly instructed to only ever return one of those ids. The service
 * still re-validates every returned id against the real catalog afterward
 * (see TemplateRecommendationService.validateTemplateIds()) — this prompt
 * instruction reduces bad output, it never replaces that validation.
 *
 * The response's array field is named `templateRecommendations`, not the
 * brief's illustrative `recommendations` — `DummyAIProvider`'s shared JSON
 * envelope already has a `recommendations: string[]` field (Career
 * Advisor's, FASE 18); reusing that same key here for an array of `{
 * templateId, rank, score, reason }` objects would silently break Career
 * Advisor's own response parsing. A distinct field name avoids that
 * collision without touching Career Advisor's existing contract.
 */
@Injectable()
export class TemplateRecommendationPromptBuilder extends PromptBuilder<TemplateRecommendationPromptInput> {
  readonly metadata = { feature: AIFeature.TEMPLATE_RECOMMENDATION, version: PROMPT_VERSION };

  build(context: PromptContext<TemplateRecommendationPromptInput>): PromptResult {
    const {
      masterResume,
      workExperienceCount,
      educationCount,
      skillsCount,
      languages,
      resumeVariant,
      jobTarget,
      availableTemplates,
    } = context.input.context;

    const hasProfileData =
      masterResume !== null || workExperienceCount > 0 || resumeVariant !== null;

    const text = [
      'You are a professional résumé design consultant.',
      `Recommend up to ${MAX_RECOMMENDATIONS} résumé templates from the catalog below, best suited to the candidate profile and (when given) their target role.`,
      'You may ONLY recommend templates by an "id" value taken verbatim from the catalog below — never invent, guess, or slightly-modify an id. A recommendation naming any other id is useless and will be discarded.',
      'Never invent facts about the candidate not present in the data below.',
      '',
      hasProfileData
        ? '## Candidate profile'
        : '## Candidate profile\n(none available — the candidate has not filled in any profile/resume data yet. Recommend generally-safe, ATS-friendly templates and say so in the summary.)',

      masterResume
        ? [
            masterResume.title ? `Title: ${masterResume.title}` : undefined,
            masterResume.summary ? `Summary: ${masterResume.summary}` : undefined,
            masterResume.careerLevel ? `Career level: ${masterResume.careerLevel}` : undefined,
            masterResume.yearsExperience != null
              ? `Years of experience: ${masterResume.yearsExperience}`
              : undefined,
            masterResume.desiredPosition
              ? `Desired position: ${masterResume.desiredPosition}`
              : undefined,
          ]
            .filter((l): l is string => l !== undefined)
            .join('\n')
        : undefined,

      workExperienceCount > 0 || educationCount > 0 || skillsCount > 0 || languages.length > 0
        ? [
            `Work experience entries: ${workExperienceCount}`,
            `Education entries: ${educationCount}`,
            `Skills listed: ${skillsCount}`,
            languages.length > 0 ? `Languages: ${languages.join(', ')}` : undefined,
          ]
            .filter((l): l is string => l !== undefined)
            .join('\n')
        : undefined,

      resumeVariant ? `Resume variant being templated: ${resumeVariant.title}` : undefined,

      jobTarget
        ? [
            '## Target role',
            `Title: ${jobTarget.title}`,
            jobTarget.company ? `Company: ${jobTarget.company}` : undefined,
            jobTarget.seniority ? `Seniority: ${jobTarget.seniority}` : undefined,
            jobTarget.employmentType ? `Employment type: ${jobTarget.employmentType}` : undefined,
          ]
            .filter((l): l is string => l !== undefined)
            .join('\n')
        : undefined,

      '',
      '## Template catalog (recommend ONLY from these — use the exact "id")',
      JSON.stringify(
        availableTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category,
          isATSFriendly: t.isATSFriendly,
          premium: t.premium,
        })),
        null,
        2,
      ),
      '',
      '## Desired output',
      'Respond with JSON ONLY — no markdown, no prose outside the JSON object. The JSON object must match exactly this shape:',
      JSON.stringify(
        {
          summary: 'string — a short overview explaining the recommendation set as a whole',
          templateRecommendations: [
            {
              templateId:
                'string — MUST be an "id" copied verbatim from the template catalog above',
              rank: 'number — 1 for the best match, increasing from there',
              score: 'number — 0 to 100, how well this template fits the candidate/role',
              reason: 'string — a specific, concrete explanation for this recommendation',
            },
          ],
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
