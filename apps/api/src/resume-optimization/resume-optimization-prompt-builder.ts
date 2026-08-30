import { Injectable } from '@nestjs/common';
import type { AtsReport } from '@prisma/client';
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

export interface ResumeOptimizationPromptInput {
  resumeContent: Record<string, unknown>;
  jobTarget: JobTargetWithChildren;
  atsReport: AtsReport;
}

/**
 * The first real feature builder registered into AI Orchestration's
 * PromptRegistry (Phase 7) — see docs/architecture/ai-orchestration.md §11
 * "Future Provider Integration" / "Future feature Integration" for the
 * pattern this follows. Renders the Resume Variant, its linked Job Target,
 * and the "before" ATS Report into one prompt instructing a JSON-only
 * response — never calls a provider itself, that's AiOrchestrationService's
 * job via ProviderSelector/ModelSelector.
 */
@Injectable()
export class ResumeOptimizationPromptBuilder extends PromptBuilder<ResumeOptimizationPromptInput> {
  readonly metadata = { feature: AIFeature.RESUME_OPTIMIZATION, version: PROMPT_VERSION };

  build(context: PromptContext<ResumeOptimizationPromptInput>): PromptResult {
    const { resumeContent, jobTarget, atsReport } = context.input;

    const weakSections = this.describeWeakSections(resumeContent);
    const text = [
      'You are a professional resume optimization assistant.',
      'Analyze the resume below against the job target and ATS report, and propose concrete improvements.',
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
      `Languages: ${jobTarget.languages.map((l) => l.language).join(', ') || '(none)'}`,
      '',
      '## ATS Report (current state)',
      `Current overall score: ${atsReport.overallScore}/100`,
      `Keyword score: ${atsReport.keywordScore}, Skills score: ${atsReport.skillsScore}, Experience score: ${atsReport.experienceScore}, Education score: ${atsReport.educationScore}, Language score: ${atsReport.languageScore}, Formatting score: ${atsReport.formattingScore}, Completion score: ${atsReport.completionScore}`,
      `Missing keywords: ${atsReport.missingKeywords.join(', ') || '(none)'}`,
      `Missing/recommended skills: ${atsReport.recommendedSkills.join(', ') || '(none)'}`,
      `Existing recommendations: ${atsReport.recommendations.join('; ') || '(none)'}`,
      `Weak or empty sections: ${weakSections.join(', ') || '(none detected)'}`,
      '',
      '## Desired output',
      'Respond with JSON ONLY — no markdown, no prose outside the JSON object. The JSON object must match exactly this shape:',
      JSON.stringify(
        {
          summary: 'string — a short overview of the proposed optimization',
          predictedScore: 'number — the ATS score you predict if every suggestion is accepted',
          suggestions: [
            {
              type: 'one of KEYWORD | SUMMARY | EXPERIENCE | SKILL | EDUCATION | PROJECT | ACHIEVEMENT | LANGUAGE | CERTIFICATION | GENERAL',
              section:
                'one of summary | experience | skills | projects | education | languages | certifications | achievements',
              priority: 'one of LOW | MEDIUM | HIGH | CRITICAL',
              title: 'string — short suggestion title',
              reason: 'string — why this suggestion helps',
              originalText:
                'string — the existing text being replaced, or "" if this is a new addition',
              suggestedText: 'string — the proposed replacement or addition text',
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

  private describeWeakSections(resumeContent: Record<string, unknown>): string[] {
    const weak: string[] = [];
    if (!resumeContent.summary || String(resumeContent.summary).trim().length < 20) {
      weak.push('summary');
    }
    const arrayFields: Array<[string, string]> = [
      ['workExperiences', 'experience'],
      ['skills', 'skills'],
      ['projects', 'projects'],
      ['educations', 'education'],
      ['languages', 'languages'],
      ['certificates', 'certifications'],
      ['awards', 'achievements'],
    ];
    for (const [contentKey, label] of arrayFields) {
      const value = resumeContent[contentKey];
      if (!Array.isArray(value) || value.length === 0) {
        weak.push(label);
      }
    }
    return weak;
  }
}
