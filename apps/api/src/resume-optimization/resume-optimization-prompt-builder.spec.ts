import type { AtsReport } from '@prisma/client';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';
import type { JobTargetWithChildren } from '../job-target/job-target.repository';
import { ResumeOptimizationPromptBuilder } from './resume-optimization-prompt-builder';

describe('ResumeOptimizationPromptBuilder', () => {
  const builder = new ResumeOptimizationPromptBuilder();

  const jobTarget = {
    id: 'jt-1',
    title: 'Senior Backend Engineer',
    company: 'Acme Corp',
    seniority: 'Senior',
    keywords: [{ keyword: 'Kubernetes' }, { keyword: 'PostgreSQL' }],
    skills: [
      { skill: 'TypeScript', required: true },
      { skill: 'Docker', required: false },
    ],
    languages: [{ language: 'English' }],
  } as unknown as JobTargetWithChildren;

  const atsReport = {
    overallScore: 62,
    keywordScore: 40,
    skillsScore: 70,
    experienceScore: 80,
    educationScore: 90,
    languageScore: 100,
    formattingScore: 75,
    completionScore: 60,
    missingKeywords: ['Kubernetes'],
    recommendedSkills: ['Docker'],
    recommendations: ['Add more quantifiable achievements.'],
  } as unknown as AtsReport;

  const resumeContent = {
    summary: 'Backend engineer.',
    workExperiences: [{ company: 'Acme', description: 'Built services.' }],
    skills: [{ name: 'TypeScript' }],
    projects: [],
    educations: [],
    languages: [],
    certificates: [],
    awards: [],
  };

  it('declares itself for the RESUME_OPTIMIZATION feature', () => {
    expect(builder.metadata.feature).toBe(AIFeature.RESUME_OPTIMIZATION);
    expect(builder.metadata.version).toBeGreaterThanOrEqual(1);
  });

  it('renders the resume content, job target, ATS scores, and desired JSON schema into the prompt text', () => {
    const result = builder.build({
      userId: 'user-1',
      input: { resumeContent, jobTarget, atsReport },
    });

    expect(result.text).toContain('Senior Backend Engineer');
    expect(result.text).toContain('Acme Corp');
    expect(result.text).toContain('Kubernetes');
    expect(result.text).toContain('Docker');
    expect(result.text).toContain('62/100');
    expect(result.text).toContain('JSON ONLY');
    expect(result.text).toContain('"predictedScore"');
    expect(result.text).toContain('"suggestions"');
    expect(result.text).toContain(JSON.stringify(resumeContent));
  });

  it('lists sections with empty/missing arrays as weak sections', () => {
    const result = builder.build({
      userId: 'user-1',
      input: { resumeContent, jobTarget, atsReport },
    });

    expect(result.text).toMatch(/Weak or empty sections:.*projects/);
    expect(result.text).toMatch(/Weak or empty sections:.*education/);
    expect(result.text).toMatch(/Weak or empty sections:.*certifications/);
    expect(result.text).toMatch(/Weak or empty sections:.*achievements/);
  });

  it('does not list a populated section as weak', () => {
    const result = builder.build({
      userId: 'user-1',
      input: { resumeContent, jobTarget, atsReport },
    });
    const weakLine = result.text
      .split('\n')
      .find((line) => line.startsWith('Weak or empty sections:'));
    expect(weakLine).toBeDefined();
    expect(weakLine).not.toMatch(/\bexperience\b/);
    expect(weakLine).not.toMatch(/\bskills\b/);
  });

  it('produces a stable, deterministic hash for identical input', () => {
    const first = builder.build({
      userId: 'user-1',
      input: { resumeContent, jobTarget, atsReport },
    });
    const second = builder.build({
      userId: 'user-1',
      input: { resumeContent, jobTarget, atsReport },
    });
    expect(first.hash).toBe(second.hash);
    expect(first.text).toBe(second.text);
  });

  it('produces a different hash when the input changes', () => {
    const first = builder.build({
      userId: 'user-1',
      input: { resumeContent, jobTarget, atsReport },
    });
    const second = builder.build({
      userId: 'user-1',
      input: { resumeContent, jobTarget, atsReport: { ...atsReport, overallScore: 90 } },
    });
    expect(first.hash).not.toBe(second.hash);
  });

  it('handles a job target with no keywords/skills/languages gracefully', () => {
    const emptyJobTarget = { ...jobTarget, keywords: [], skills: [], languages: [] };
    const result = builder.build({
      userId: 'user-1',
      input: { resumeContent, jobTarget: emptyJobTarget, atsReport },
    });
    expect(result.text).toContain('(none)');
  });
});
