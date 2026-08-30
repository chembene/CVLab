import type { AtsReport } from '@prisma/client';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import type { JobTargetWithChildren } from '../job-target/job-target.repository';
import { InterviewQuestionPromptBuilder } from './interview-question-prompt-builder';

describe('InterviewQuestionPromptBuilder', () => {
  const builder = new InterviewQuestionPromptBuilder();

  const jobTarget = {
    id: 'jt-1',
    title: 'Senior Backend Engineer',
    company: 'Acme Corp',
    seniority: 'Senior',
    keywords: [{ keyword: 'Kubernetes' }],
    skills: [{ skill: 'TypeScript', required: true }],
  } as unknown as JobTargetWithChildren;

  const atsReport = {
    overallScore: 62,
    missingKeywords: ['Kubernetes'],
    recommendedSkills: ['Docker'],
  } as unknown as AtsReport;

  const resumeContent = { summary: 'Backend engineer.' };

  const baseInput = {
    mode: 'RESUME' as const,
    resumeContent,
    jobTarget,
    atsReport,
    optimizationSummary: null,
    coverLetterContent: null,
    type: 'MIXED' as const,
    difficulty: 'SENIOR' as const,
    language: 'en',
    questionCount: 6,
  };

  it('declares itself for the INTERVIEW_QUESTIONS feature', () => {
    expect(builder.metadata.feature).toBe(AIFeature.INTERVIEW_QUESTIONS);
    expect(builder.metadata.version).toBeGreaterThanOrEqual(1);
  });

  it('renders resume content, job target, ATS scores, type/difficulty/language, and the desired JSON schema', () => {
    const result = builder.build({ userId: 'user-1', input: baseInput });

    expect(result.text).toContain('Senior Backend Engineer');
    expect(result.text).toContain('Acme Corp');
    expect(result.text).toContain('Kubernetes');
    expect(result.text).toContain('62/100');
    expect(result.text).toContain('Type: MIXED');
    expect(result.text).toContain('Difficulty: SENIOR');
    expect(result.text).toContain('Language: en');
    expect(result.text).toContain('JSON ONLY');
    expect(result.text).toContain('"idealAnswer"');
    expect(result.text).toContain(JSON.stringify(resumeContent));
    expect(result.text).toContain('Respond with an array of exactly 6 items.');
  });

  it('renders "(none available)" when no optimization summary or cover letter is supplied', () => {
    const result = builder.build({ userId: 'user-1', input: baseInput });
    expect(result.text).toMatch(/## Resume Optimization Summary\n\(none available\)/);
    expect(result.text).toMatch(/## Cover Letter\n\(none available\)/);
  });

  it('includes the optimization summary and cover letter content when supplied', () => {
    const result = builder.build({
      userId: 'user-1',
      input: {
        ...baseInput,
        optimizationSummary: 'Emphasize leadership.',
        coverLetterContent: 'Dear Hiring Manager...',
      },
    });
    expect(result.text).toContain('Emphasize leadership.');
    expect(result.text).toContain('Dear Hiring Manager...');
  });

  it('produces a stable, deterministic hash for identical input', () => {
    const first = builder.build({ userId: 'user-1', input: baseInput });
    const second = builder.build({ userId: 'user-1', input: baseInput });
    expect(first.hash).toBe(second.hash);
    expect(first.text).toBe(second.text);
  });

  it('produces a different hash when questionCount changes', () => {
    const a = builder.build({ userId: 'user-1', input: baseInput });
    const b = builder.build({ userId: 'user-1', input: { ...baseInput, questionCount: 8 } });
    expect(a.hash).not.toBe(b.hash);
    expect(b.text).toContain('Respond with an array of exactly 8 items.');
  });
});
