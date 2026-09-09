import { Injectable } from '@nestjs/common';
import { AIFeature } from '../../ai-orchestration/constants/ai-feature.enum';
import { PromptHash } from '../../ai-orchestration/prompt/prompt-hash.util';
import {
  PromptBuilder,
  type PromptContext,
  type PromptResult,
} from '../../ai-orchestration/interfaces/prompt.interface';
import type { ExtractedCvData } from '../interfaces/extracted-cv-data.interface';
import { buildEligibleFields } from '../cv-import-ai-validator';

const PROMPT_VERSION = 1;

export interface CvImportPromptInput {
  data: ExtractedCvData;
}

/**
 * Registered into AI Orchestration's PromptRegistry (FASE 22), following the
 * exact structural pattern every prior feature's PromptBuilder established.
 * Sits strictly AFTER `CVParser`'s deterministic extraction — never replaces
 * it, never re-extracts from raw text (the model here never even sees the
 * original PDF/DOCX text, only the already-structured draft). Its only job
 * is to propose a REVISED value for a field the parser already populated
 * (normalize a job title, tidy a description, split responsibilities from
 * achievements, ...) or flag a field it cannot confidently improve — never
 * to invent a value for something the parser left empty. The
 * "ELIGIBLE_FIELDS_JSON" block below is the enforcement mechanism: it lists
 * every field the model is allowed to touch (computed by
 * `buildEligibleFields()`, the exact same function
 * `CvImportService.enhanceWithAi()` uses afterward to validate/ground the
 * response — one shared source of truth), and the instructions make that
 * restriction explicit so a well-behaved model targets only real fields;
 * `validateCvImportAiSuggestions()` is what actually enforces it regardless
 * of whether the model complies. The response's array is deliberately named
 * `fieldSuggestions`, not `suggestions` — `DummyAIProvider`'s single shared
 * JSON envelope already has a differently-shaped `suggestions` field
 * (Resume Optimization's), and reusing that name would silently collide,
 * the same naming-collision-avoidance precedent Template Recommendation
 * (FASE 21) established for its own `templateRecommendations` field.
 */
@Injectable()
export class CvImportPromptBuilder extends PromptBuilder<CvImportPromptInput> {
  readonly metadata = { feature: AIFeature.CV_IMPORT, version: PROMPT_VERSION };

  build(context: PromptContext<CvImportPromptInput>): PromptResult {
    const { data } = context.input;
    const eligibleFields = buildEligibleFields(data);

    const text = [
      'You are an expert CV/résumé editor helping normalize and clean up a résumé that has already been extracted from a PDF/DOCX file by a separate, deterministic parser.',
      'The parser has ALREADY found every fact below — your job is only to propose small, careful REVISIONS to existing text: normalize job titles/capitalization, tidy up messy descriptions, separate responsibilities from achievements when a description mixes both, fix obvious extraction artifacts (stray whitespace, truncated words), and flag anything genuinely ambiguous.',
      'You may ONLY propose a suggestedValue for a field listed in ELIGIBLE_FIELDS_JSON below, using the exact same section/index/field it lists — never invent a new work experience, education entry, skill, employer, date, degree, certification, or any other fact not already present in ELIGIBLE_FIELDS_JSON.',
      'NEVER invent companies, job titles, dates, degrees, institutions, certifications, or any qualification not already present in the data below.',
      'If a field genuinely needs attention but you cannot confidently propose a revision (e.g. a company name that looks truncated with nothing to safely infer it from), add a short note to "unresolvedFields" instead of guessing.',
      'Every suggestion must have a clear, specific "reason" and an honest "confidence" (0–1) — never overstate confidence for a guess.',
      '',
      '## Personal data',
      JSON.stringify(data.personalData, null, 2),
      data.summary ? `\n## Summary\n${data.summary}` : undefined,
      '',
      '## Sections',
      JSON.stringify(
        {
          workExperiences: data.workExperiences,
          educations: data.educations,
          skills: data.skills,
          languages: data.languages,
          certificates: data.certificates,
          projects: data.projects,
          awards: data.awards,
          volunteerExperiences: data.volunteerExperiences,
          references: data.references,
        },
        null,
        2,
      ),
      '',
      '## ELIGIBLE_FIELDS_JSON — the ONLY fields you may propose a suggestedValue for',
      `ELIGIBLE_FIELDS_JSON: ${JSON.stringify(eligibleFields)}`,
      '',
      '## Desired output',
      'Respond with JSON ONLY — no markdown, no prose outside the JSON object. The JSON object must match exactly this shape:',
      JSON.stringify(
        {
          fieldSuggestions: [
            {
              section: 'one of the section names used in ELIGIBLE_FIELDS_JSON',
              index: 'number (omit for personalData/summary) — matches ELIGIBLE_FIELDS_JSON',
              field: 'string — matches ELIGIBLE_FIELDS_JSON',
              originalValue: 'string — the current value, for your own reference only',
              suggestedValue: 'string — your proposed revision',
              reason: 'string — why this revision helps',
              confidence: 'number 0-1',
            },
          ],
          unresolvedFields:
            'string[] — short human-readable notes on fields needing manual attention (never a guessed value)',
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
