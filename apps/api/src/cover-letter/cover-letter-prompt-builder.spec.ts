import type { AtsReport, CoverLetterTone } from '@prisma/client';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import type { JobTargetWithChildren } from '../job-target/job-target.repository';
import { CoverLetterPromptBuilder } from './cover-letter-prompt-builder';

describe('CoverLetterPromptBuilder', () => {
  const builder = new CoverLetterPromptBuilder();

  const jobTarget = {
    id: 'jt-1',
    title: 'Senior Backend Engineer',
    company: 'Acme Corp',
    seniority: 'Senior',
    keywords: [{ keyword: 'Kubernetes' }],
    skills: [{ skill: 'TypeScript', required: true }],
    languages: [{ language: 'English' }],
  } as unknown as JobTargetWithChildren;

  const atsReport = {
    overallScore: 62,
    missingKeywords: ['Kubernetes'],
    recommendedSkills: ['Docker'],
  } as unknown as AtsReport;

  const resumeContent = { summary: 'Backend engineer.', workExperiences: [{ company: 'Acme' }] };

  it('declares itself for the COVER_LETTER feature', () => {
    expect(builder.metadata.feature).toBe(AIFeature.COVER_LETTER);
    expect(builder.metadata.version).toBeGreaterThanOrEqual(1);
  });

  it('renders resume content, job target, ATS scores, tone, language, and the desired JSON schema', () => {
    const result = builder.build({
      userId: 'user-1',
      input: {
        resumeContent,
        jobTarget,
        atsReport,
        optimizationSummary: 'Emphasize leadership.',
        tone: 'EXECUTIVE' as CoverLetterTone,
        language: 'en',
      },
    });

    expect(result.text).toContain('Senior Backend Engineer');
    expect(result.text).toContain('Acme Corp');
    expect(result.text).toContain('Kubernetes');
    expect(result.text).toContain('62/100');
    expect(result.text).toContain('Emphasize leadership.');
    expect(result.text).toContain('EXECUTIVE');
    expect(result.text).toContain('en');
    expect(result.text).toContain('JSON ONLY');
    expect(result.text).toContain('"coverLetter"');
    expect(result.text).toContain(JSON.stringify(resumeContent));
  });

  it('renders "(none available)" when no optimization summary is supplied', () => {
    const result = builder.build({
      userId: 'user-1',
      input: {
        resumeContent,
        jobTarget,
        atsReport,
        optimizationSummary: null,
        tone: 'FRIENDLY' as CoverLetterTone,
        language: 'pt-MZ',
      },
    });

    expect(result.text).toContain('(none available)');
    expect(result.text).not.toContain('Emphasize leadership.');
  });

  it('produces a stable, deterministic hash for identical input', () => {
    const input = {
      resumeContent,
      jobTarget,
      atsReport,
      optimizationSummary: null,
      tone: 'MODERN' as CoverLetterTone,
      language: 'en',
    };
    const first = builder.build({ userId: 'user-1', input });
    const second = builder.build({ userId: 'user-1', input });
    expect(first.hash).toBe(second.hash);
    expect(first.text).toBe(second.text);
  });

  it('produces a different hash when the tone changes', () => {
    const base = { resumeContent, jobTarget, atsReport, optimizationSummary: null, language: 'en' };
    const a = builder.build({
      userId: 'user-1',
      input: { ...base, tone: 'PROFESSIONAL' as CoverLetterTone },
    });
    const b = builder.build({
      userId: 'user-1',
      input: { ...base, tone: 'TECHNICAL' as CoverLetterTone },
    });
    expect(a.hash).not.toBe(b.hash);
  });
});
